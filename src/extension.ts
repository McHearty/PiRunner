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

export default function hitmHarnessExtension(pi: ExtensionAPI): void {
  const root = process.cwd();
  const validator = new ArtifactValidator();
  const artifactStore = new FileArtifactStore(validator);
  const eventStore = new FileEventStore();
  const testRunner = new RealDeterministicTestRunner(root, artifactStore as any);
  const agentRunner = new PiAgentRunner(root);
  const gitRepo = new GitRepository(root);

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

  function syncAgentToState(state: WorkflowState): string {
    switch (state) {
      case 'PROJECT_DISCOVERY':
      case 'PROJECT_INTAKE':
      case 'PROJECT_BASELINE':
      case 'STATE_RECOVERY':
      case 'STATE_VALIDATION': return '0000';
      case 'CONCEPT': return '0012';
      case 'SPECIFICATION': return '0024';
      case 'PLANNING': return '0036';
      case 'KNOWLEDGE_SYNC': return '0048';
      case 'TEST_AUTHORING': return '0120';
      case 'IMPLEMENTATION': return '0060';
      case 'TRIAGE': return '0072';
      case 'REVIEW': return '0084';
      case 'DIARY': return '0096';
      case 'PUBLICATION_READY': return '0108';
      default: return '0000';
    }
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
    return null;
  }

  function getRealDependencyLockHash(): string {
    const lockPath = join(root, 'package-lock.json');
    if (existsSync(lockPath)) {
      return createHash('sha256').update(readFileSync(lockPath)).digest('hex');
    }
    return createHash('sha256').update('no-lockfile-available').digest('hex');
  }

  // Canonical Startup Pipeline (§5, §18)
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

  // /hitm-status: shows current state and all allowed next states
  pi.registerCommand('hitm-status', {
    description: 'Display current state, mode, active agent, lock, and legal next transitions',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const state = controller.getState();
      const currentAgent = syncAgentToState(state);
      const lock = TestSuiteLock.loadLock();
      const lockSummary = lock ? `Locked (${lock.testSuiteContentHash.slice(0, 8)})` : 'Unlocked';
      
      const legalNext = getAllowedTargetStates(state).filter(
        s => !['ARTIFACT_INVALID', 'REPOSITORY_CONFLICT', 'ABORT', 'AGENT_FAILED'].includes(s)
      );

      ctx.ui.notify(
        `State: [${state}] | Mode: ${discovery.entryMode} | Agent: ${currentAgent} | TestLock: ${lockSummary}\n` +
        `Allowed Next Transitions: [${legalNext.join(', ')}]`,
        'info'
      );
    }
  });

  pi.registerCommand('hitm-prompt', {
    description: 'View layered governance sub-prompt for the active agent',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const currentAgent = syncAgentToState(controller.getState());
      const prompt = AgentPromptFactory.createAgentSystemPrompt(currentAgent);
      ctx.ui.notify(`Active Sub-Prompt Loaded for Agent ${currentAgent} (${prompt.length} chars)`, 'info');
    }
  });

  // /hitm-approve: guides with legal states if omitted
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
          ctx.ui.notify(`State advanced to [${controller.getState()}]`, 'info');
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

  // Closed-Loop: Invocation-Scoped Dispatch -> Artifact Extraction -> Transition (§1, §12, §52, §61)
  pi.registerCommand('hitm-run', {
    description: 'Dispatch active agent, ingest typed artifact, validate schema, and advance workflow',
    handler: async (taskPrompt: string, ctx: ExtensionContext) => {
      const currentState = controller.getState();
      const executingAgentId = syncAgentToState(currentState);
      const expectedType = getExpectedArtifactForState(currentState);
      const promptText = taskPrompt.trim() || `Execute duties for state [${currentState}]. Output must include valid JSON for ${expectedType}.`;

      const contextArtifactIds: string[] = [];
      const masterSpec = artifactStore.getLatestAccepted('MasterSpecification');
      const sprintSpec = artifactStore.getLatestAccepted('SprintSpecification');
      const testSpec = artifactStore.getLatestAccepted('TestSpecification');
      const knowledge = artifactStore.getLatestAccepted('KnowledgeSnapshot');

      if (masterSpec) contextArtifactIds.push(masterSpec.artifactId);
      if (sprintSpec) contextArtifactIds.push(sprintSpec.artifactId);
      if (testSpec) contextArtifactIds.push(testSpec.artifactId);
      if (knowledge) contextArtifactIds.push(knowledge.artifactId);

      ctx.ui.notify(`Invoking Agent ${executingAgentId} in [${currentState}]...`, 'info');

      try {
        const execution = await agentRunner.start({
          invocationId: `inv-${Date.now()}`,
          agentId: executingAgentId,
          workflowId,
          taskId: `task-${currentState}`,
          prompt: promptText,
          contextArtifactIds
        });

        if (execution.status === 'FAILED') {
          ctx.ui.notify(`Agent execution failed: ${execution.rawOutput}`, 'error');
          await controller.transition('AGENT_FAILED', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { agentExecutionStatus: 'FAILED' } });
          return;
        }

        if (expectedType) {
          const ingestion = ArtifactIngestionService.ingestFromExecution(
            execution,
            expectedType,
            workflowId,
            `task-${currentState}`,
            executingAgentId,
            validator,
            artifactStore as any
          );

          if (!ingestion.success) {
            ctx.ui.notify(`Artifact ingestion failed: ${ingestion.errors.join(', ')}`, 'error');
            await controller.transition('ARTIFACT_INVALID', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationFailed: true } });
            return;
          }

          ctx.ui.notify(`Validated and persisted ${expectedType} [${ingestion.artifact?.artifactId}]`, 'info');

          const targetTransition = getTargetTransitionForArtifact(currentState, expectedType);
          if (targetTransition) {
            try {
              await controller.transition(targetTransition, { actorType: 'AGENT', actorId: executingAgentId }, { artifactIds: [ingestion.artifact!.artifactId] });
              ctx.ui.notify(`Workflow advanced automatically to [${controller.getState()}]`, 'info');
            } catch (transitionErr: any) {
              ctx.ui.notify(`Transition guard failed: ${transitionErr.message}`, 'warning');
            }
          }
        }

        ctx.ui.notify(`Agent ${executingAgentId} loop completed successfully.`, 'info');
      } catch (err: any) {
        ctx.ui.notify(`Agent run exception: ${err.message}`, 'error');
      }
    }
  });
}
