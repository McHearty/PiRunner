import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

export default function hitmHarnessExtension(pi: ExtensionAPI): void {
  const root = process.cwd();
  const validator = new ArtifactValidator();
  const artifactStore = new FileArtifactStore(validator);
  const eventStore = new FileEventStore();
  const testRunner = new RealDeterministicTestRunner(root, artifactStore as any);
  const agentRunner = new PiAgentRunner(root);
  const gitRepo = new GitRepository(root);

  let roster = AgentRosterService.getOrGenerateRoster(root);
  const workflowId = 'pirunner-canonical';
  const discovery = ProjectDiscoveryService.inspect(root);

  const controller = new WorkflowController(
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
    if (state === 'PLANNING' && artifactType === 'SprintSpecification') return 'KNOWLEDGE_SYNC';
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

  function getRealDependencyLockHash(): string {
    const lockPath = join(root, 'package-lock.json');
    if (existsSync(lockPath)) {
      return createHash('sha256').update(readFileSync(lockPath)).digest('hex');
    }
    return createHash('sha256').update('no-lockfile-available').digest('hex');
  }

  // Startup Pipeline
  if (controller.getState() === 'PROJECT_DISCOVERY') {
    if (discovery.entryMode === 'RESUME_WORKFLOW') {
      const recovery = StateRecoveryService.recover(eventStore as any, workflowId);
      const validation = StateValidationService.validate(recovery, discovery.repositorySnapshot, artifactStore as any, root);

      controller.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } })
        .then(() => controller.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' }))
        .then(() => {
          if (validation.status === 'MATCH') {
            return controller.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
          } else {
            return controller.transition('REPOSITORY_CONFLICT', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MISMATCH' } });
          }
        })
        .catch(async (err) => {
          console.error('[PiRunner Startup Resume Failure]:', err.message);
          await controller.transition('AGENT_FAILED', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { unrecoverable: true, startupError: err.message } }).catch(() => {});
        });
    } else if (discovery.entryMode === 'ADOPT_EXISTING_PROJECT') {
      controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } })
        .then(() => {
          const baseline = ProjectIntakeService.createBaselineArtifact(workflowId, discovery.repositorySnapshot, gitRepo, root);
          artifactStore.save(baseline);
          return controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
        })
        .then(() => controller.transition('KNOWLEDGE_SYNC', { actorType: 'SYSTEM', actorId: '0000' }))
        .then(() => controller.transition('PLANNING', { actorType: 'SYSTEM', actorId: '0000' }))
        .catch(async (err) => {
          console.error('[PiRunner Adoption Failure]:', err.message);
          await controller.transition('AGENT_FAILED', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { unrecoverable: true, adoptionError: err.message } }).catch(() => {});
        });
    }
  }

  // 1. Natural Chat Persona Chaining (§1, §46-§48): Returns { systemPrompt } per Pi Extension API specification
  if (typeof (pi as any).on === 'function') {
    (pi as any).on('before_agent_start', async (event: any, ctx: ExtensionContext) => {
      updateFooterStatus(ctx);
      const state = controller.getState();
      const agent = getActiveAgentEntry(state);
      const expectedType = getExpectedArtifactForState(state);

      const prompt = AgentPromptFactory.createAgentSystemPrompt(agent.canonicalRole);
      const instruction = expectedType
        ? `\nActive Workflow State: [${state}]. Your current role: ${AgentRosterService.formatBadge(agent)}. Output must include valid JSON for ${expectedType}.`
        : `\nActive Workflow State: [${state}]. Your current role: ${AgentRosterService.formatBadge(agent)}.`;

      const base = event?.systemPrompt ? `${event.systemPrompt}\n` : '';
      return {
        systemPrompt: `${base}${prompt}${instruction}`
      };
    });

    // 2. Natural Chat Turn-End Interception
    (pi as any).on('turn_end', async (event: any, ctx: ExtensionContext) => {
      updateFooterStatus(ctx);
      const currentState = controller.getState();
      const expectedType = getExpectedArtifactForState(currentState);
      const agent = getActiveAgentEntry(currentState);

      if (!expectedType) return;

      const rawText = typeof event?.message?.content === 'string'
        ? event.message.content
        : Array.isArray(event?.message?.content)
          ? event.message.content.map((b: any) => b.text || '').join('\n')
          : '';

      if (!rawText) return;

      const ingestion = ArtifactIngestionService.ingestFromExecution(
        { invocationId: `turn-${Date.now()}`, status: 'COMPLETED', rawOutput: rawText },
        expectedType,
        workflowId,
        `task-${currentState}`,
        agent.id,
        validator,
        artifactStore as any
      );

      if (ingestion.success && ingestion.artifact) {
        const target = getTargetTransitionForArtifact(currentState, expectedType);
        if (target) {
          const confirmed = await ctx.ui.confirm(
            'HITM Step Authorization',
            `${AgentRosterService.formatBadge(agent)} completed ${expectedType}.\nAuthorize transition to [${target}]?`
          );
          if (confirmed) {
            try {
              await controller.transition(target, { actorType: 'AGENT', actorId: agent.id }, { artifactIds: [ingestion.artifact.artifactId] });
              updateFooterStatus(ctx);
              ctx.ui.notify(`State advanced to [${controller.getState()}]`, 'info');
            } catch (err: any) {
              ctx.ui.notify(`Transition rejected: ${err.message}`, 'error');
            }
          }
        }
      }
    });
  }

  // Interactive Commands
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
        } catch (err: any) {
          ctx.ui.notify(`Transition rejected: ${err.message}`, 'error');
        }
      }
    }
  });

  pi.registerCommand('hitm-test', {
    description: 'Trigger authoritative TestRunner consuming accepted TestSpecification and real lockfile',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const testSpec = artifactStore.getLatestAccepted('TestSpecification');
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
        const result = await testRunner.execute({
          workflowId,
          taskId: 'authoritative-run',
          testSpecificationArtifactId: testSpec?.artifactId || 'art-locked',
          testSuiteContentHash: expectedHash,
          repositoryRevision: freshSnap.headSha,
          dependencyLockHash: depLockHash,
          executionCommand: 'npm test'
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
