import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { WorkflowController } from './application/WorkflowController.js';
import { ArtifactValidator } from './domain/artifacts/ArtifactValidator.js';
import { FileArtifactStore } from './infrastructure/artifacts/FileArtifactStore.js';
import { FileEventStore } from './infrastructure/events/FileEventStore.js';
import { RealDeterministicTestRunner } from './infrastructure/testing/RealDeterministicTestRunner.js';
import { PiAgentRunner } from './infrastructure/pi/PiAgentRunner.js';
import { GitRepository } from './infrastructure/git/GitRepository.js';
import { AgentPromptFactory } from './agents/AgentPrompts.js';
import { WorkflowState } from './domain/workflow/WorkflowState.js';
import { ProjectDiscoveryService, ProjectEntryMode } from './domain/project/ProjectDiscovery.js';
import { ProjectIntakeService } from './domain/project/ProjectIntake.js';
import { StateRecoveryService } from './domain/project/StateRecovery.js';
import { StateValidationService } from './domain/project/StateValidation.js';
import { TestSuiteLock } from './domain/testing/TestSuiteLock.js';
import { ArtifactIngestionService } from './domain/artifacts/ArtifactIngestion.js';
import { getAllowedTargetStates } from './domain/workflow/WorkflowTransition.js';
import { AgentRosterService, CanonicalRole, AgentRosterEntry } from './domain/agents/AgentIdentity.js';
import { GitKnowledgeProvider } from './infrastructure/knowledge/GitKnowledgeProvider.js';
import { AGENT_TASK_CATALOG } from './domain/agents/AgentTaskCatalog.js';
import { PathCapabilityEnforcer } from './domain/repository/PathCapability.js';
import { ARTIFACT_SKELETONS } from './domain/artifacts/ArtifactSkeletons.js';
import { WorkflowIdentityService, WorkflowIdentity } from './domain/workflow/WorkflowIdentity.js';

export default function hitmHarnessExtension(pi: ExtensionAPI): void {
  const root = process.cwd();
  const validator = new ArtifactValidator();
  const artifactStore = new FileArtifactStore(validator);
  const eventStore = new FileEventStore();
  const testRunner = new RealDeterministicTestRunner(root, artifactStore as any);
  const agentRunner = new PiAgentRunner(root);
  const gitRepo = new GitRepository(root);
  const knowledgeProvider = new GitKnowledgeProvider(root);

  let roster = AgentRosterService.getOrGenerateRoster(root);
  let workflowId: string;
  let discovery = ProjectDiscoveryService.inspect(root);
  let cachedPiInitialPrompt: string | null = null;

  // Workflow identity management (Sprint 8)
  function resolveWorkflowIdentity(): { workflowId: string; controller: WorkflowController } {
    // Use discovery to identify active workflow (now identity-aware)
    if (discovery.entryMode === 'RESUME_WORKFLOW' && discovery.activeWorkflowId) {
      // Resume existing active workflow identified by discovery
      return {
        workflowId: discovery.activeWorkflowId,
        controller: new WorkflowController(
          discovery.activeWorkflowId,
          artifactStore as any,
          eventStore as any,
          testRunner,
          agentRunner,
          {},
          'PROJECT_DISCOVERY',
          gitRepo,
          root
        )
      };
    }
    
    if (discovery.entryMode === 'RESUME_WORKFLOW') {
      // Legacy: existing journal without identity file
      return {
        workflowId: 'pirunner-canonical',
        controller: new WorkflowController(
          'pirunner-canonical',
          artifactStore as any,
          eventStore as any,
          testRunner,
          agentRunner,
          {},
          'PROJECT_DISCOVERY',
          gitRepo,
          root
        )
      };
    }
    
    // New workflow
    return startNewWorkflow(discovery.entryMode);
  }

  function createController(wfId: string, initialState: WorkflowState = 'PROJECT_DISCOVERY'): WorkflowController {
    return new WorkflowController(
      wfId,
      artifactStore as any,
      eventStore as any,
      testRunner,
      agentRunner,
      {},
      initialState,
      gitRepo,
      root
    );
  }

  function startNewWorkflow(entryMode: ProjectEntryMode): { workflowId: string; controller: WorkflowController } {
    const newId = WorkflowIdentityService.generateNewId();
    const newIdentity: WorkflowIdentity = {
      workflowId: newId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    WorkflowIdentityService.save(newIdentity, root);

    // Create first canonical event immediately (not deferred to session_start)
    // This ensures the workflow is restartable even if process is killed before transitions complete
    const stateAfter = entryMode === 'NEW_PROJECT' ? 'CONCEPT' : 'PROJECT_INTAKE';

    eventStore.append({
      eventId: `evt-${newId}-init`,
      workflowId: newId,
      sequence: 0,
      type: 'TRANSITION',
      actorType: 'SYSTEM',
      actorId: '0000',
      timestamp: new Date().toISOString(),
      stateBefore: 'PROJECT_DISCOVERY',
      stateAfter: stateAfter as WorkflowState,
      artifactIds: [],
      metadata: { entryMode }
    });

    // Controller resumes at the state after the initial transition
    const newController = createController(newId, stateAfter as WorkflowState);

    return { workflowId: newId, controller: newController };
  }

  async function archiveOldWorkflow(oldWorkflowId: string, reason: string, validationStatus: string): Promise<void> {
    // Recover old workflow's canonical state
    const recovery = StateRecoveryService.recover(eventStore as any, oldWorkflowId);
    
    if (recovery.recovered) {
      // Recoverable path: transition through controller to ABORT via T-106
      const oldController = createController(oldWorkflowId, recovery.canonicalState);
      await oldController.transition('ABORT',
        { actorType: 'HUMAN', actorId: 'lead-human' },
        {
          humanApproved: true,
          metadata: {
            humanAbort: true,
            archiveReason: reason,
            validationStatus: validationStatus,
            recoveryStatus: 'RECOVERED',
            archivedAt: new Date().toISOString()
          }
        }
      );
    } else {
      // Unrecoverable path: write archival audit event directly.
      // Do not construct a controller or fabricate a canonical state.
      // Do not rewrite the existing journal.
      const archivalEvent = {
        eventId: `evt-${oldWorkflowId}-archived-${Date.now()}`,
        workflowId: oldWorkflowId,
        sequence: eventStore.getNextSequence(oldWorkflowId),
        type: 'WORKFLOW_ARCHIVED',
        actorType: 'HUMAN' as const,
        actorId: 'lead-human',
        timestamp: new Date().toISOString(),
        stateBefore: 'UNKNOWN' as any,
        stateAfter: 'ABORT' as any,
        artifactIds: [],
        metadata: {
          humanAbort: true,
          archiveReason: reason,
          validationStatus: validationStatus,
          recoveryStatus: 'UNRECOVERABLE',
          recoveryError: recovery.error,
          archivedAt: new Date().toISOString()
        }
      };
      eventStore.append(archivalEvent);
    }

    // Mark old workflow identity as non-active
    const identity = WorkflowIdentityService.load(root);
    if (identity && identity.workflowId === oldWorkflowId) {
      identity.status = 'ABORTED';
      WorkflowIdentityService.save(identity, root);
    }
  }

  const resolved = resolveWorkflowIdentity();
  workflowId = resolved.workflowId;
  let controller = resolved.controller;

  // Control/readiness states have no active specialist agent.
  // These are gates, not work states: SPRINT_READY, TEST_READY,
  // COMMIT_CREATED, SPRINT_ACCEPTED, PUSH_GATE, DAY_COMPLETE, etc.
  const CONTROL_STATES: Set<string> = new Set([
    'SPRINT_READY', 'TEST_READY', 'COMMIT_CREATED', 'SPRINT_ACCEPTED',
    'PUSH_GATE', 'DAY_COMPLETE', 'REMOTE_PUBLISHED', 'SPRINT_COMPLETE',
    'PUBLISHED', 'CONCEPT_REVIEW', 'SPECIFICATION_REVIEW', 'REWORK',
    'HUMAN_GATE', 'STATE_RECOVERY', 'STATE_VALIDATION', 'ARTIFACT_INVALID',
    'REPOSITORY_CONFLICT', 'AGENT_FAILED', 'ABORT'
  ]);

  function syncAgentToState(state: WorkflowState): string {
    if (CONTROL_STATES.has(state)) {
      throw new Error(`State [${state}] has no active agent role (control state)`);
    }
    const roleMap: Record<string, CanonicalRole> = {
      CONCEPT: 'CONCEPT',
      SPECIFICATION: 'SPECIFICATION',
      PLANNING: 'PLANNING',
      KNOWLEDGE_SYNC: 'KNOWLEDGE',
      TEST_AUTHORING: 'TEST_AUTHORING',
      IMPLEMENTATION: 'IMPLEMENTATION',
      TRIAGE: 'TRIAGE',
      REVIEW: 'REVIEW',
      DIARY: 'DEVLOG',
      SKILL_SYNTHESIS: 'SKILL_ARCHITECT',
      PUBLICATION_READY: 'PUBLICATION'
    };
    const canonicalRole = roleMap[state];
    if (!canonicalRole) {
      throw new Error(`State [${state}] has no active agent role`);
    }
    return roster[canonicalRole].id;
  }

  function getActiveAgentEntry(state: WorkflowState): AgentRosterEntry | null {
    if (CONTROL_STATES.has(state)) {
      return null;
    }
    const roleMap: Record<string, CanonicalRole> = {
      CONCEPT: 'CONCEPT',
      SPECIFICATION: 'SPECIFICATION',
      PLANNING: 'PLANNING',
      KNOWLEDGE_SYNC: 'KNOWLEDGE',
      TEST_AUTHORING: 'TEST_AUTHORING',
      IMPLEMENTATION: 'IMPLEMENTATION',
      TRIAGE: 'TRIAGE',
      REVIEW: 'REVIEW',
      DIARY: 'DEVLOG',
      SKILL_SYNTHESIS: 'SKILL_ARCHITECT',
      PUBLICATION_READY: 'PUBLICATION'
    };
    const canonicalRole = roleMap[state];
    if (!canonicalRole) {
      return null;
    }
    return roster[canonicalRole];
  }

  function getExpectedArtifactForState(state: WorkflowState): string | null {
    switch (state) {
      case 'CONCEPT': return 'ConceptPackage';
      case 'SPECIFICATION': return 'MasterSpecification';
      case 'PLANNING': return 'SprintSpecification';
      case 'KNOWLEDGE_SYNC': return 'KnowledgeSnapshot';
      case 'TEST_AUTHORING': return 'TestSpecification';
      case 'IMPLEMENTATION': return 'ImplementationResult';
      case 'TRIAGE': return 'TriageReport';
      case 'REVIEW': return 'ReviewResult';
      case 'DIARY': return 'DailyDevlog';
      case 'SKILL_SYNTHESIS': return 'SkillPackage';
      case 'PUBLICATION_READY': return 'PublicationPackage';
      default: return null;
    }
  }

  function getTargetTransitionForArtifact(state: WorkflowState, artifactType: string): WorkflowState | null {
    if (state === 'CONCEPT' && artifactType === 'ConceptPackage') return 'CONCEPT_REVIEW';
    if (state === 'SPECIFICATION' && artifactType === 'MasterSpecification') return 'SPECIFICATION_REVIEW';
    if (state === 'KNOWLEDGE_SYNC' && artifactType === 'KnowledgeSnapshot') return 'PLANNING';
    if (state === 'PLANNING' && artifactType === 'SprintSpecification') return 'SPRINT_READY';
    if (state === 'TEST_AUTHORING' && artifactType === 'TestSpecification') return 'TEST_READY';
    if (state === 'IMPLEMENTATION' && artifactType === 'ImplementationResult') return 'COMMIT_CREATED';
    if (state === 'SKILL_SYNTHESIS' && artifactType === 'SkillPackage') return 'PLANNING';
    return null;
  }

  // Control states with deterministic automatic next transitions.
  // These have humanApproval: NEVER in the transition registry.
  function getTargetTransitionForControlState(state: WorkflowState): WorkflowState | null {
    switch (state) {
      case 'SPRINT_READY':
        return 'TEST_AUTHORING';  // T-040
      default:
        return null;
    }
  }

  function updateFooterStatus(ctx?: ExtensionContext) {
    const state = controller.getState();
    const agent = getActiveAgentEntry(state);
    const badge = agent ? AgentRosterService.formatBadge(agent) : `[${state}] (no active agent)`;
    if (ctx && (ctx.ui as any)?.setStatus) {
      (ctx.ui as any).setStatus('hitm-agent', badge);
    }
  }

  function buildRoleWrappedPrompt(promptText: string, state: WorkflowState): string {
    const agent = getActiveAgentEntry(state);
    if (!agent) {
      return promptText;
    }
    const expectedType = getExpectedArtifactForState(state);
    const skeleton = expectedType && ARTIFACT_SKELETONS[expectedType] ? ARTIFACT_SKELETONS[expectedType] : '';

    let roleGuidance = '';
    if (state === 'PLANNING') {
      roleGuidance = `
ROLE DIRECTIVE: You are strictly ${AgentRosterService.formatBadge(agent)} (Planning Specialist).
The Knowledge Synchronization phase is FINISHED. You are NO LONGER the Knowledge Specialist.
Do NOT write code or edit files. You have NO permission to edit files.

Your primary responsibility is to understand the user's planning intent through conversation.
When the user is describing goals, asking questions, providing requirements, or exploring work,
converse naturally and ask clarifying questions when needed.

Do NOT prematurely produce a SprintSpecification merely because the user mentions planning,
questions, requirements, or sprints.

Only produce the SprintSpecification artifact when:
1. The user's requirements are sufficiently understood, AND
2. The user explicitly asks you to formalize the discussion into a plan, or otherwise
   clearly authorizes plan generation.

Until then, remain conversational and do not emit a SprintSpecification artifact.
When you do produce the SprintSpecification, decompose the requirements into sprint goals,
tasks for Confident Forge, and acceptance criteria for Methodical Scribe.`;
    } else if (state === 'TEST_AUTHORING') {
      roleGuidance = `
ROLE DIRECTIVE: You are strictly ${AgentRosterService.formatBadge(agent)} (Test Authoring Specialist).
Author acceptance tests in tests/** only. You are strictly forbidden from writing to src/**.`;
    } else if (state === 'IMPLEMENTATION') {
      roleGuidance = `
ROLE DIRECTIVE: You are strictly ${AgentRosterService.formatBadge(agent)} (Implementation Specialist).
Implement production code in src/** to pass the locked test suite. Authoritative tests are read-only.`;
    }

    const deliverableInstruction = expectedType
      ? `\nDELIVERABLE REQUIREMENT:\nConclude your response with a valid, complete JSON code block for ${expectedType} matching this exact skeleton:\n${skeleton}\n`
      : '';

    return `================================================================================
ACTIVE AGENT: ${AgentRosterService.formatBadge(agent)} [STATE: ${state}]
${roleGuidance}
================================================================================

User Instruction:
${promptText}
${deliverableInstruction}`;
  }

  async function dispatchTurnToModel(promptText: string, ctx?: ExtensionContext): Promise<void> {
    const state = controller.getState();
    const wrappedPrompt = buildRoleWrappedPrompt(promptText, state);

    try {
      if (typeof (pi as any).sendUserMessage === 'function') {
        await (pi as any).sendUserMessage(wrappedPrompt, { deliverAs: 'followUp' });
      } else if (typeof (pi as any).sendMessage === 'function') {
        await (pi as any).sendMessage(
          { content: [{ type: 'text', text: wrappedPrompt }] },
          { deliverAs: 'followUp', triggerTurn: true }
        );
      } else if (ctx) {
        ctx.ui.notify(`[PiRunner]: Prompt ready. Press enter in chat to begin.`, 'info');
      }
    } catch (err: any) {
      if (ctx) {
        ctx.ui.notify(`[PiRunner Dispatch]: ${err.message}`, 'warning');
      }
    }
  }

  function getRealDependencyLockHash(): string {
    const candidates = ['package-lock.json', 'gradle.lockfile', 'pom.xml', 'Cargo.lock'];
    for (const c of candidates) {
      const p = join(root, c);
      if (existsSync(p)) {
        return createHash('sha256').update(readFileSync(p)).digest('hex');
      }
    }
    return createHash('sha256').update('no-lockfile-available').digest('hex');
  }

  // Interactive Agent Handoff & Task Selection Modal
  async function promptAgentHandoff(newAgent: AgentRosterEntry, newState: WorkflowState, ctx: ExtensionContext) {
    updateFooterStatus(ctx);
    const badge = AgentRosterService.formatBadge(newAgent);
    const tasks = AGENT_TASK_CATALOG[newAgent.canonicalRole] || [];

    const options = [
      ...tasks.map((t, idx) => `${idx + 1}. ${t}`),
      'Other: Custom task or natural conversation'
    ];

    let selected: string | undefined;
    if (typeof (ctx.ui as any).select === 'function') {
      selected = await (ctx.ui as any).select(
        `Handoff to ${badge} [${newState}] — Select Task:`,
        options
      );
    }

    if (selected && !selected.startsWith('Other')) {
      const taskText = selected.replace(/^\d+\.\s*/, '');
      ctx.ui.notify(`Dispatching ${badge}: "${taskText}"`, 'info');
      await dispatchTurnToModel(taskText, ctx);
    } else {
      // Natural conversation or custom task: continue in Pi's normal chat input.
      // Do NOT force user through extension modal input (clipboard UX defect).
      ctx.ui.notify(`Continue the conversation with ${badge} using the normal Pi chat input.`, 'info');
    }
  }

  // Robust, Immediate Conflict Resolution Modal (§9, §54)
  async function promptConflictResolution(ctx: ExtensionContext) {
    const uncommitted = gitRepo.getUncommittedFiles();

    const options = [
      'PRESERVE: Record uncommitted files as baseline and advance to KNOWLEDGE_SYNC',
      'STASH: Stash uncommitted changes (git stash) and resume',
      'RESET: Discard changes (git reset --hard) and resume',
      'ABORT: Abort workflow and freeze automated operations'
    ];

    let choice: string | undefined;
    if (typeof (ctx.ui as any).select === 'function') {
      choice = await (ctx.ui as any).select(
        `Repository Conflict: ${uncommitted.length} uncommitted file(s) detected`,
        options
      );
    } else {
      const confirmPreserve = await ctx.ui.confirm(
        'Repository Conflict: Dirty Working Tree',
        `${uncommitted.length} uncommitted file(s) detected.\nPreserve as baseline and advance to KNOWLEDGE_SYNC?`
      );
      choice = confirmPreserve ? options[0] : options[3];
    }

    if (!choice || choice.startsWith('ABORT')) {
      await controller.transition('ABORT', { actorType: 'HUMAN', actorId: 'lead-human' }, { humanApproved: true });
      ctx.ui.notify('Workflow frozen in [ABORT].', 'warning');
      return;
    }

    if (choice.startsWith('PRESERVE')) {
      ctx.ui.notify(`Preserving ${uncommitted.length} file(s) in baseline.`, 'info');

      const freshSnap = gitRepo.getFreshSnapshot();

      // Record conflict resolution as a canonical event (never rewrite history)
      const resolutionEvent: any = {
        eventId: `evt-${workflowId}-resolution-${Date.now()}`,
        workflowId,
        sequence: eventStore.getNextSequence(workflowId),
        type: 'REPOSITORY_CONFLICT_RESOLUTION',
        actorType: 'HUMAN',
        actorId: 'lead-human',
        timestamp: new Date().toISOString(),
        stateBefore: controller.getState(),
        stateAfter: controller.getState(),
        artifactIds: [],
        metadata: {
          resolution: 'PRESERVE',
          repositoryRevision: freshSnap.headSha,
          uncommittedFiles: uncommitted,
          conflictContext: 'dirty working tree at session start or resume validation'
        }
      };
      eventStore.append(resolutionEvent);

      try {
        // Ensure we're in REPOSITORY_CONFLICT state before resolving the conflict.
        // This uses the proper conflict resolution transition path (T-103A) rather
        // than the fresh-start adoption path (T-001A) which has the G-PROJECT-004
        // guard that fails when canonical history already exists.
        if (controller.getState() !== 'REPOSITORY_CONFLICT') {
          await controller.transition('REPOSITORY_CONFLICT', { actorType: 'SYSTEM', actorId: '0000' });
        }

        // Create baseline artifact with dirty working tree state
        const baseline = ProjectIntakeService.createBaselineArtifact(workflowId, freshSnap, gitRepo, root);
        baseline.payload.workingTreeState = 'DIRTY';
        baseline.payload.detectedUncommittedChanges = uncommitted;
        artifactStore.save(baseline);

        // Resolve conflict: transition to PROJECT_INTAKE via T-103A
        // (REPOSITORY_CONFLICT → PROJECT_INTAKE, humanApproval: ALWAYS)
        await controller.transition('PROJECT_INTAKE', { actorType: 'HUMAN', actorId: 'lead-human' }, {
          humanApproved: true,
          metadata: { resolution: 'PRESERVE' }
        });

        // Continue to baseline and knowledge sync
        if (controller.getState() !== 'PROJECT_BASELINE') {
          await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
        }
        if (controller.getState() !== 'KNOWLEDGE_SYNC') {
          await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' }, {
            metadata: { preserveDirty: true }
          });
        }

        updateFooterStatus(ctx);
        const knowledgeAgent = getActiveAgentEntry('KNOWLEDGE_SYNC');
        ctx.ui.notify(`Project baseline established with ${uncommitted.length} preserved file(s). State is now [KNOWLEDGE_SYNC].`, 'info');
        if (knowledgeAgent) {
          await promptAgentHandoff(knowledgeAgent, 'KNOWLEDGE_SYNC', ctx);
        }
      } catch (error) {
        // RCA-2: Transition failures must not terminate the extension.
        // Record the error and re-prompt with actionable choices.
        const err = error as Error;
        ctx.ui.notify(`PRESERVE transition failed: ${err.message}`, 'error');
        await promptConflictResolution(ctx);
      }
      return;
    }

    if (choice.startsWith('STASH')) {
      try {
        execSync('git stash', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
        ctx.ui.notify('Uncommitted changes stashed.', 'info');
      } catch (err: any) {
        ctx.ui.notify(`Failed to stash: ${err.message}`, 'error');
        return;
      }
    } else if (choice.startsWith('RESET')) {
      try {
        execSync('git reset --hard HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
        ctx.ui.notify('Working tree reset to clean HEAD.', 'info');
      } catch (err: any) {
        ctx.ui.notify(`Failed to reset: ${err.message}`, 'error');
        return;
      }
    }

    discovery = ProjectDiscoveryService.inspect(root);
    controller.setRepositorySnapshot(discovery.repositorySnapshot);

    const recovery = StateRecoveryService.recover(eventStore as any, workflowId);
    const validation = StateValidationService.validate(
      recovery, discovery.repositorySnapshot, artifactStore as any, root, workflowId,
      eventStore.getEvents(workflowId)
    );

    if (validation.status === 'MATCH') {
      await controller.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
      ctx.ui.notify(`Conflict resolved. Resumed canonical state [${controller.getState()}].`, 'info');
      const resumedAgent = getActiveAgentEntry(controller.getState());
      if (resumedAgent) {
        await promptAgentHandoff(resumedAgent, controller.getState(), ctx);
      }
    } else {
      ctx.ui.notify(`Conflict persists after resolution: ${validation.reasons.join(', ')}`, 'error');
    }
    updateFooterStatus(ctx);
  }

  // Tool capability sandboxing is handled by PiAgentRunner.authorizeToolCall
  // (invocation-scoped). The extension's tool_call handler was removed to
  // eliminate the duplicate authorization path that relied on workflow state
  // instead of invocation context.

  if (typeof (pi as any).on === 'function') {
    // 1. Hook session_start: Immediate check on startup/reload
    (pi as any).on('session_start', async (_event: any, ctx: ExtensionContext) => {
      updateFooterStatus(ctx);

      // Direct check: if repository is dirty, prompt immediately (§9, §54)
      if (!discovery.repositorySnapshot.isClean) {
        await promptConflictResolution(ctx);
        return;
      }

      if (controller.getState() === 'PROJECT_DISCOVERY') {
        if (discovery.entryMode === 'RESUME_WORKFLOW') {
          const recovery = StateRecoveryService.recover(eventStore as any, workflowId);
          const validation = StateValidationService.validate(
            recovery, discovery.repositorySnapshot, artifactStore as any, root, workflowId,
            eventStore.getEvents(workflowId)
          );

          if (!recovery.recovered || validation.status === 'MISMATCH') {
            // Sprint 8: Offer START NEW WORKFLOW option when resume validation fails
            const options = [
              'RESUME: Attempt recovery of existing workflow',
              'START NEW WORKFLOW: Preserve history and begin new workflow',
              'ABORT: Leave repository/workflow untouched'
            ];
            let choice: string | undefined;
            if (typeof (ctx.ui as any).select === 'function') {
              choice = await (ctx.ui as any).select(
                `Existing workflow validation failed: ${validation.reasons.join(', ')}`, options);
            } else {
              const confirmResume = await ctx.ui.confirm(
                'Existing workflow validation failed',
                `${validation.reasons.join(', ')}\nAttempt recovery?`
              );
              choice = confirmResume ? options[0] : options[2];
            }

            if (choice && choice.startsWith('RESUME')) {
              await promptConflictResolution(ctx);
            } else if (choice && choice.startsWith('START NEW')) {
              // Archive old workflow and start new
              ctx.ui.notify(`Archiving workflow [${workflowId}] and starting new workflow...`, 'info');
              await archiveOldWorkflow(workflowId, 'human_requested_new_workflow', validation.status);

              // Use canonical new-workflow creation path
              const newWf = startNewWorkflow(discovery.entryMode);
              workflowId = newWf.workflowId;
              controller = newWf.controller;
              discovery = ProjectDiscoveryService.inspect(root);

              ctx.ui.notify(`New workflow [${workflowId}] created. Starting from discovery.`, 'info');
              updateFooterStatus(ctx);
            } else {
              ctx.ui.notify('Workflow aborted by user.', 'warning');
              return;
            }
          } else {
            await controller.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } });
            await controller.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' });
            await controller.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
            ctx.ui.notify(`Resumed canonical workflow state [${controller.getState()}].`, 'info');
            const agent = getActiveAgentEntry(controller.getState());
            if (agent) {
              await promptAgentHandoff(agent, controller.getState(), ctx);
            }
          }
        } else if (discovery.entryMode === 'ADOPT_EXISTING_PROJECT') {
          await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });
          const baseline = ProjectIntakeService.createBaselineArtifact(workflowId, discovery.repositorySnapshot, gitRepo, root);
          artifactStore.save(baseline);
          await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
          await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' });

          updateFooterStatus(ctx);
          const knowledgeAgent = getActiveAgentEntry('KNOWLEDGE_SYNC');
          ctx.ui.notify('Adopted existing repository. State is [KNOWLEDGE_SYNC].', 'info');
          if (knowledgeAgent) {
            await promptAgentHandoff(knowledgeAgent, 'KNOWLEDGE_SYNC', ctx);
          }
        }
      }

      updateFooterStatus(ctx);
    });

    // 2. Hook before_agent_start: Inject active role persona
    (pi as any).on('before_agent_start', async (event: any, ctx: ExtensionContext) => {
      updateFooterStatus(ctx);
      const state = controller.getState();

      if (state === 'REPOSITORY_CONFLICT') {
        await promptConflictResolution(ctx);
        return;
      }

      // Control states have no active agent; don't wrap the prompt.
      const agent = getActiveAgentEntry(state);
      if (!agent) {
        return null;
      }
      const expectedType = getExpectedArtifactForState(state);

      if (cachedPiInitialPrompt === null && event?.systemPrompt) {
        cachedPiInitialPrompt = event.systemPrompt.split('Inference Governance and Engineering Reasoning System Prompt')[0].trim();
      }
      const cleanBase = cachedPiInitialPrompt !== null ? cachedPiInitialPrompt : '';

      const prompt = AgentPromptFactory.createAgentSystemPrompt(agent.canonicalRole);
      const skeleton = expectedType && ARTIFACT_SKELETONS[expectedType] ? ARTIFACT_SKELETONS[expectedType] : '';

      const handoffNotice = `
================================================================================
CRITICAL IDENTITY & WORKFLOW BOUNDARY:
Current Workflow State: [${state}]
Active Specialized Agent: ${AgentRosterService.formatBadge(agent)} (${agent.roleDescription})

ATTENTION:
Regardless of what character, task, or role was discussed in previous messages,
you are NOW strictly ${AgentRosterService.formatBadge(agent)}.
Do NOT speak, act, or identify as any previous specialist (e.g. you are NOT the Knowledge Specialist).
You have ZERO state transition authority. Transitions are strictly governed by PiRunner framework dialogs.
================================================================================
`;

      const instruction = expectedType
        ? `\nDeliverable: Output a complete, valid JSON code block for ${expectedType} matching this skeleton:\n${skeleton}\n`
        : '';

      return {
        systemPrompt: `${cleanBase}\n\n${handoffNotice}\n\n${prompt}${instruction}`
      };
    });

    // 3. Hook agent_end: Ingests Artifacts with Error Transparency
    (pi as any).on('agent_end', async (event: any, ctx: ExtensionContext) => {
      updateFooterStatus(ctx);
      const currentState = controller.getState();
      const currentAgent = getActiveAgentEntry(currentState);
      const expectedType = getExpectedArtifactForState(currentState);

      if (!expectedType || !currentAgent) return;

      let rawText = '';
      if (Array.isArray(event?.messages)) {
        const assistantMsgs = event.messages.filter((m: any) => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          const last = assistantMsgs[assistantMsgs.length - 1];
          if (typeof last.content === 'string') {
            rawText = last.content;
          } else if (Array.isArray(last.content)) {
            rawText = last.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text || '')
              .join('\n');
          }
        }
      }

      if (!rawText && typeof (ctx as any).session?.getLastAssistantText === 'function') {
        rawText = (ctx as any).session.getLastAssistantText() || '';
      }
      if (!rawText && typeof event?.message?.content === 'string') {
        rawText = event.message.content;
      }

      if (!rawText) return;

      const ingestion = ArtifactIngestionService.ingestFromExecution(
        { invocationId: `run-${Date.now()}`, status: 'COMPLETED', rawOutput: rawText },
        expectedType,
        workflowId,
        `task-${currentState}`,
        currentAgent.canonicalRole,
        validator,
        artifactStore as any
      );

      // CASE A: Model produced valid JSON artifact -> Immediate HITM promotion modal
      if (ingestion.success && ingestion.artifact) {
        const target = getTargetTransitionForArtifact(currentState, expectedType);
        if (target) {
          const confirmed = await ctx.ui.confirm(
            'HITM Step Authorization',
            `${AgentRosterService.formatBadge(currentAgent)} completed ${expectedType}.\nAuthorize transition from [${currentState}] to [${target}]?`
          );
          if (confirmed) {
            try {
              await controller.transition(target, { actorType: 'AGENT', actorId: currentAgent.id }, {
                humanApproved: true,
                artifactIds: [ingestion.artifact.artifactId]
              });

              // Automatic advancement from control states to next work state.
              // SPRINT_READY has no active agent; advance to TEST_AUTHORING via T-040.
              while (CONTROL_STATES.has(controller.getState())) {
                const autoTarget = getTargetTransitionForControlState(controller.getState());
                if (!autoTarget) break;
                await controller.transition(autoTarget, { actorType: 'SYSTEM', actorId: '0000' });
                ctx.ui.notify(`Auto-advanced to [${controller.getState()}]`, 'info');
              }

              updateFooterStatus(ctx);

              const nextAgent = getActiveAgentEntry(controller.getState());
              if (nextAgent && nextAgent.canonicalRole !== currentAgent.canonicalRole) {
                await promptAgentHandoff(nextAgent, controller.getState(), ctx);
              }
            } catch (err: any) {
              ctx.ui.notify(`Transition guard rejected: ${err.message}`, 'error');
            }
          }
        }
        return;
      }

      // CASE B: Conversational response without artifact -> Human-In-The-Middle Confirmation
      const promptToFormalize = await ctx.ui.confirm(
        'Artifact Pending',
        `${AgentRosterService.formatBadge(currentAgent)} responded without a ${expectedType} JSON artifact.\nPrompt ${currentAgent.name} to formalize the discussion into ${expectedType} now?`
      );

      if (promptToFormalize) {
        await dispatchTurnToModel(
          `Formalize our discussion into the required ${expectedType} JSON artifact code block now matching its schema.`,
          ctx
        );
      }
    });
  }

  // Interactive Slash Commands
  pi.registerCommand('hitm-tasks', {
    description: 'Open the task catalog for the currently active agent',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const state = controller.getState();
      const agent = getActiveAgentEntry(state);
      if (agent) {
        await promptAgentHandoff(agent, state, ctx);
      } else {
        ctx.ui.notify(`No active agent in state [${state}] (control state)`, 'info');
      }
    }
  });

  pi.registerCommand('hitm-conflict', {
    description: 'Interactively resolve an active repository conflict (stash, reset, preserve, abort)',
    handler: async (_args: string, ctx: ExtensionContext) => {
      await promptConflictResolution(ctx);
    }
  });

  pi.registerCommand('hitm-status', {
    description: 'Display current state, active [ID NAME] agent, and legal next transitions',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const state = controller.getState();
      const agent = getActiveAgentEntry(state);
      const badge = agent ? AgentRosterService.formatBadge(agent) : '(none)';
      updateFooterStatus(ctx);

      const lock = TestSuiteLock.loadLock();
      const lockSummary = lock ? `Locked (${lock.testSuiteContentHash.slice(0, 8)})` : 'Unlocked';
      
      const legalNext = getAllowedTargetStates(state).filter(
        s => !['ARTIFACT_INVALID', 'REPOSITORY_CONFLICT', 'ABORT', 'AGENT_FAILED'].includes(s)
      );

      ctx.ui.notify(
        `State: [${state}] | Active: ${badge} | TestLock: ${lockSummary}\n` +
        `Allowed Next Transitions: [${legalNext.join(', ')}]`,
        'info'
      );
    }
  });

  pi.registerCommand('hitm-prompt', {
    description: 'View layered governance sub-prompt for the active agent',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const agent = getActiveAgentEntry(controller.getState());
      if (agent) {
        const prompt = AgentPromptFactory.createAgentSystemPrompt(agent.canonicalRole);
        ctx.ui.notify(`Active Sub-Prompt Loaded for ${AgentRosterService.formatBadge(agent)} (${prompt.length} chars)`, 'info');
      } else {
        ctx.ui.notify(`No active agent in state [${controller.getState()}] (control state)`, 'info');
      }
    }
  });

  pi.registerCommand('hitm-approve', {
    description: 'Authorize and execute next state transition as Human Authority',
    handler: async (targetState: string, ctx: ExtensionContext) => {
      const currentState = controller.getState();
      const oldAgent = getActiveAgentEntry(currentState);
      const legalNext = getAllowedTargetStates(currentState).filter(
        s => !['ARTIFACT_INVALID', 'REPOSITORY_CONFLICT', 'ABORT', 'AGENT_FAILED'].includes(s)
      );

      const target = (targetState.trim() || legalNext[0] || '') as WorkflowState;
      if (!target) {
        ctx.ui.notify(`No legal forward transitions from [${currentState}].`, 'warning');
        return;
      }

      if (!legalNext.includes(target)) {
        ctx.ui.notify(
          `Illegal transition [${currentState} → ${target}].\nLegal next states are: [${legalNext.join(', ')}]`,
          'warning'
        );
        return;
      }

      const confirmed = await ctx.ui.confirm(
        'HITM Transition Authorization',
        `Authorize transition from [${currentState}] to [${target}]?`
      );

      if (confirmed) {
        try {
          await controller.transition(target, { actorType: 'HUMAN', actorId: 'lead-human' }, { humanApproved: true });

          // Auto-advance from control states
          while (CONTROL_STATES.has(controller.getState())) {
            const autoTarget = getTargetTransitionForControlState(controller.getState());
            if (!autoTarget) break;
            await controller.transition(autoTarget, { actorType: 'SYSTEM', actorId: '0000' });
            ctx.ui.notify(`Auto-advanced to [${controller.getState()}]`, 'info');
          }

          updateFooterStatus(ctx);
          const newAgent = getActiveAgentEntry(controller.getState());
          if (newAgent) {
            ctx.ui.notify(`State advanced to [${controller.getState()}] | Active: ${AgentRosterService.formatBadge(newAgent)}`, 'info');
            if (!oldAgent || newAgent.canonicalRole !== oldAgent.canonicalRole) {
              await promptAgentHandoff(newAgent, controller.getState(), ctx);
            }
          } else {
            ctx.ui.notify(`State advanced to [${controller.getState()}] (control state, no active agent)`, 'info');
          }
        } catch (err: any) {
          ctx.ui.notify(`Transition rejected: ${err.message}`, 'error');
        }
      }
    }
  });

  pi.registerCommand('hitm-test', {
    description: 'Trigger authoritative TestRunner consuming accepted TestSpecification and real lockfile',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const testSpec = artifactStore.getLatestAccepted('TestSpecification', workflowId);
      const lock = TestSuiteLock.loadLock();
      const expectedHash = lock?.testSuiteContentHash || (testSpec?.payload as any)?.testSuiteContentHash;

      if (!expectedHash) {
        ctx.ui.notify('Cannot run authoritative test: No accepted TestSpecification or TestSuiteLock found.', 'warning');
        return;
      }

      const depLockHash = getRealDependencyLockHash();
      ctx.ui.notify(`Executing authoritative test suite against locked hash (${expectedHash.slice(0, 10)}...)...`, 'info');
      try {
        const freshSnap = gitRepo.getFreshSnapshot();
        const executionCommand = (testSpec?.payload as any)?.executionCommand;
        if (!executionCommand) {
          ctx.ui.notify('Cannot run authoritative test: TestSpecification does not specify executionCommand.', 'warning');
          return;
        }

        const result = await testRunner.execute({
          workflowId,
          taskId: 'authoritative-run',
          testSpecificationArtifactId: testSpec?.artifactId || 'art-locked',
          testSuiteContentHash: expectedHash,
          repositoryRevision: freshSnap.headSha,
          dependencyLockHash: depLockHash,
          executionCommand
        });

        if (result.status === 'PASSED') {
          ctx.ui.notify(`Authoritative tests PASSED (${result.passed} passed).`, 'info');
        } else {
          ctx.ui.notify(`Authoritative tests FAILED. Output: ${result.rawOutput.slice(0, 150)}...`, 'error');
        }
      } catch (err: any) {
        ctx.ui.notify(`TestRunner Error: ${err.message}`, 'error');
      }
    }
  });

  pi.registerCommand('hitm-roster', {
    description: 'View or regenerate the project agent roster',
    handler: async (arg: string, ctx: ExtensionContext) => {
      if (arg.trim() === 'regenerate') {
        roster = AgentRosterService.generateProjectRoster();
        ctx.ui.notify('Generated new randomized project roster (.hitm/agent-roster.json updated).', 'info');
      } else {
        const summary = Object.values(roster)
          .map(r => `${AgentRosterService.formatBadge(r)}: ${r.roleDescription}`)
          .join('\n');
        ctx.ui.notify(`Project Roster:\n${summary}`, 'info');
      }
      updateFooterStatus(ctx);
    }
  });
  }
