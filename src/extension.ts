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
import { PathCapabilityEnforcer } from './domain/repository/PathCapability.js';
import { AgentPromptFactory } from './agents/AgentPrompts.js';
import { WorkflowState } from './domain/workflow/WorkflowState.js';
import { ProjectDiscoveryService } from './domain/project/ProjectDiscovery.js';
import { ProjectIntakeService } from './domain/project/ProjectIntake.js';
import { StateRecoveryService } from './domain/project/StateRecovery.js';
import { StateValidationService } from './domain/project/StateValidation.js';
import { TestSuiteLock } from './domain/testing/TestSuiteLock.js';

export default function hitmHarnessExtension(pi: ExtensionAPI): void {
  const root = process.cwd();
  const validator = new ArtifactValidator();
  const artifactStore = new FileArtifactStore(validator);
  const eventStore = new FileEventStore();
  const testRunner = new RealDeterministicTestRunner(root);
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
      const validation = StateValidationService.validate(recovery, discovery.repositorySnapshot);

      controller.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } })
        .then(() => controller.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' }))
        .then(() => {
          if (validation.status === 'MATCH') {
            return controller.transition(recovery.canonicalState, { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MATCH' } });
          } else {
            return controller.transition('REPOSITORY_CONFLICT', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { validationStatus: 'MISMATCH' } });
          }
        })
        .catch(() => {});
    } else if (discovery.entryMode === 'ADOPT_EXISTING_PROJECT') {
      controller.transition('PROJECT_INTAKE', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'ADOPT_EXISTING_PROJECT' } })
        .then(() => {
          const baseline = ProjectIntakeService.createBaselineArtifact(workflowId, discovery.repositorySnapshot, root);
          artifactStore.save(baseline);
          return controller.transition('PROJECT_BASELINE', { actorType: 'SYSTEM', actorId: '0000' });
        })
        .catch(() => {});
    }
  }

  let activeAgentId = syncAgentToState(controller.getState());

  // 1. Tool-level capability boundary hook
  pi.on('tool_call', async (call) => {
    if (call.toolName === 'write' || call.toolName === 'edit') {
      const filePath = (call.args.path || call.args.filePath || '') as string;
      const allowed = PathCapabilityEnforcer.isWriteAllowed(activeAgentId, filePath);
      if (!allowed) {
        throw new Error(
          `[HITM Boundary Violation]: Agent ${activeAgentId} is forbidden from writing to "${filePath}".`
        );
      }
    }
  });

  // 2. Command: /hitm-status
  pi.registerCommand('hitm-status', {
    description: 'Display current HITM state, mode, active agent, and test lock status',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const state = controller.getState();
      activeAgentId = syncAgentToState(state);
      const lock = TestSuiteLock.loadLock();
      const lockSummary = lock ? `Locked (${lock.testSuiteContentHash.slice(0, 8)})` : 'Unlocked';
      ctx.ui.notify(
        `State: [${state}] | Mode: ${discovery.entryMode} | Agent: ${activeAgentId} | TestLock: ${lockSummary}`,
        'info'
      );
    }
  });

  // 3. Command: /hitm-prompt
  pi.registerCommand('hitm-prompt', {
    description: 'View layered governance sub-prompt for the active agent',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const prompt = AgentPromptFactory.createAgentSystemPrompt(activeAgentId);
      ctx.ui.notify(`Active Sub-Prompt Loaded for Agent ${activeAgentId} (${prompt.length} chars)`, 'info');
    }
  });

  // 4. Command: /hitm-approve
  pi.registerCommand('hitm-approve', {
    description: 'Authorize and execute next state transition as Human Authority',
    handler: async (targetState: string, ctx: ExtensionContext) => {
      const target = targetState.trim() as WorkflowState;
      if (!target) {
        ctx.ui.notify('Usage: /hitm-approve <TARGET_STATE>', 'warning');
        return;
      }
      const confirmed = await ctx.ui.confirm(
        'HITM Transition Authorization',
        `Authorize transition from ${controller.getState()} to ${target}?`
      );
      if (confirmed) {
        try {
          await controller.transition(target, { actorType: 'HUMAN', actorId: 'lead-human' }, { humanApproved: true });
          activeAgentId = syncAgentToState(controller.getState());
          ctx.ui.notify(`State advanced to ${controller.getState()}. Active Agent: ${activeAgentId}`, 'info');
        } catch (err: any) {
          ctx.ui.notify(`Transition rejected: ${err.message}`, 'error');
        }
      }
    }
  });

  // 5. Command: /hitm-test (Consumes Real Dependency Lock and Accepted TestSpecification)
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

  // 6. Command: /hitm-run (Closed-Loop Agent Invocation with Context Artifacts)
  pi.registerCommand('hitm-run', {
    description: 'Dispatch the active agent through PiAgentRunner with layered governance prompt and context artifacts',
    handler: async (taskPrompt: string, ctx: ExtensionContext) => {
      const promptText = taskPrompt.trim() || `Perform bounded duty for state [${controller.getState()}]`;
      
      // Bind relevant context artifacts to agent invocation (§61)
      const contextArtifactIds: string[] = [];
      const masterSpec = artifactStore.getLatestAccepted('MasterSpecification');
      const sprintSpec = artifactStore.getLatestAccepted('SprintSpecification');
      const testSpec = artifactStore.getLatestAccepted('TestSpecification');
      const knowledge = artifactStore.getLatestAccepted('KnowledgeSnapshot');

      if (masterSpec) contextArtifactIds.push(masterSpec.artifactId);
      if (sprintSpec) contextArtifactIds.push(sprintSpec.artifactId);
      if (testSpec) contextArtifactIds.push(testSpec.artifactId);
      if (knowledge) contextArtifactIds.push(knowledge.artifactId);

      ctx.ui.notify(`Invoking Agent ${activeAgentId} in role [${syncAgentToState(controller.getState())}] with ${contextArtifactIds.length} context artifact(s)...`, 'info');

      try {
        const execution = await agentRunner.start({
          invocationId: `inv-${Date.now()}`,
          agentId: activeAgentId,
          workflowId,
          taskId: `task-${controller.getState()}`,
          prompt: promptText,
          contextArtifactIds
        });

        ctx.ui.notify(`Agent ${activeAgentId} execution completed: ${execution.status}`, 'info');
      } catch (err: any) {
        ctx.ui.notify(`Agent execution failed: ${err.message}`, 'error');
      }
    }
  });
}
