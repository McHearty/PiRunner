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
import { ProjectDiscoveryService } from './domain/project/ProjectDiscovery.js';
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
  const workflowId = 'pirunner-canonical';
  let discovery = ProjectDiscoveryService.inspect(root);
  let cachedPiInitialPrompt: string | null = null;

  let controller = new WorkflowController(
    workflowId,
    artifactStore as any,
    eventStore as any,
    testRunner,
    agentRunner,
    {},
    'PROJECT_DISCOVERY',
    gitRepo,
    root
  );

  function syncAgentToState(state: WorkflowState): string {
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
    const canonicalRole = roleMap[state] || 'CONCEPT';
    return roster[canonicalRole].id;
  }

  function getActiveAgentEntry(state: WorkflowState): AgentRosterEntry {
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
    const canonicalRole = roleMap[state] || 'CONCEPT';
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

  function updateFooterStatus(ctx?: ExtensionContext) {
    const state = controller.getState();
    const agent = getActiveAgentEntry(state);
    const badge = AgentRosterService.formatBadge(agent);
    if (ctx && (ctx.ui as any)?.setStatus) {
      (ctx.ui as any).setStatus('hitm-agent', badge);
    }
  }

  function buildRoleWrappedPrompt(promptText: string, state: WorkflowState): string {
    const agent = getActiveAgentEntry(state);
    const expectedType = getExpectedArtifactForState(state);
    const skeleton = expectedType && ARTIFACT_SKELETONS[expectedType] ? ARTIFACT_SKELETONS[expectedType] : '';

    let roleGuidance = '';
    if (state === 'PLANNING') {
      roleGuidance = `
ROLE DIRECTIVE: You are strictly ${AgentRosterService.formatBadge(agent)} (Planning Specialist).
The Knowledge Synchronization phase is FINISHED. You are NO LONGER the Knowledge Specialist.
Do NOT write code or edit files. You have NO permission to edit files.
Your ONLY job is to take the user's request and formulate a SprintSpecification JSON artifact.
Decompose the user's intent into sprint goals, tasks for Confident Forge, and acceptance criteria for Methodical Scribe.`;
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
    } else if (selected && selected.startsWith('Other')) {
      if (typeof (ctx.ui as any).input === 'function') {
        const customPrompt = await (ctx.ui as any).input(
          `Custom Task for ${badge} [${newState}]`,
          'Enter custom goal or prompt (e.g. "Update documentation and create commit")'
        );
        if (customPrompt && customPrompt.trim()) {
          await dispatchTurnToModel(customPrompt.trim(), ctx);
          return;
        }
      }
      ctx.ui.notify(`Chat naturally with ${badge} in the prompt below.`, 'info');
    } else {
      ctx.ui.notify(`Active agent is now ${badge}. Chat naturally below or use /hitm-tasks.`, 'info');
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

      // If resuming an existing workflow, continue from recovered state
      if (discovery.entryMode === 'RESUME_WORKFLOW' && eventStore.getEvents(workflowId).length > 0) {
        const recovery = StateRecoveryService.recover(eventStore as any, workflowId);
        if (recovery.recovered) {
          await controller.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } });
          await controller.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' });
          await controller.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
          ctx.ui.notify(`Resumed canonical workflow state [${controller.getState()}] after PRESERVE resolution.`, 'info');
          const agent = getActiveAgentEntry(controller.getState());
          updateFooterStatus(ctx);
          await promptAgentHandoff(agent, controller.getState(), ctx);
          return;
        }
      }

      // If adopting, establish baseline and proceed
      const baseline = ProjectIntakeService.createBaselineArtifact(workflowId, freshSnap, gitRepo, root);
      baseline.payload.workingTreeState = 'DIRTY';
      baseline.payload.detectedUncommittedChanges = uncommitted;
      artifactStore.save(baseline);

      if (controller.getState() === 'PROJECT_DISCOVERY') {
        await controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } });
      }
      if (controller.getState() !== 'PROJECT_BASELINE') {
        await controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
      }
      if (controller.getState() !== 'KNOWLEDGE_SYNC') {
        await controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { preserveDirty: true } });
      }

      updateFooterStatus(ctx);
      const knowledgeAgent = getActiveAgentEntry('KNOWLEDGE_SYNC');
      ctx.ui.notify(`Project baseline established with ${uncommitted.length} preserved file(s). State is now [KNOWLEDGE_SYNC].`, 'info');
      await promptAgentHandoff(knowledgeAgent, 'KNOWLEDGE_SYNC', ctx);
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
      await promptAgentHandoff(resumedAgent, controller.getState(), ctx);
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
            await promptConflictResolution(ctx);
          } else {
            await controller.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } });
            await controller.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' });
            await controller.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
            ctx.ui.notify(`Resumed canonical workflow state [${controller.getState()}].`, 'info');
            const agent = getActiveAgentEntry(controller.getState());
            await promptAgentHandoff(agent, controller.getState(), ctx);
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
          await promptAgentHandoff(knowledgeAgent, 'KNOWLEDGE_SYNC', ctx);
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

      const agent = getActiveAgentEntry(state);
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

      if (!expectedType) return;

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
              await controller.transition(target, { actorType: 'AGENT', actorId: currentAgent.id }, { artifactIds: [ingestion.artifact.artifactId] });
              updateFooterStatus(ctx);
              ctx.ui.notify(`State advanced to [${controller.getState()}]`, 'info');

              const nextAgent = getActiveAgentEntry(controller.getState());
              if (nextAgent.canonicalRole !== currentAgent.canonicalRole) {
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
      await promptAgentHandoff(agent, state, ctx);
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
      const badge = AgentRosterService.formatBadge(agent);
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
      const prompt = AgentPromptFactory.createAgentSystemPrompt(agent.canonicalRole);
      ctx.ui.notify(`Active Sub-Prompt Loaded for ${AgentRosterService.formatBadge(agent)} (${prompt.length} chars)`, 'info');
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
          updateFooterStatus(ctx);
          const newAgent = getActiveAgentEntry(controller.getState());
          ctx.ui.notify(`State advanced to [${controller.getState()}] | Active: ${AgentRosterService.formatBadge(newAgent)}`, 'info');

          if (newAgent.canonicalRole !== oldAgent.canonicalRole) {
            await promptAgentHandoff(newAgent, controller.getState(), ctx);
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
