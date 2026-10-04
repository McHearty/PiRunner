import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { WorkflowController } from './application/WorkflowController.js';
import { ArtifactValidator } from './domain/artifacts/ArtifactValidator.js';
import { FileArtifactStore } from './infrastructure/artifacts/FileArtifactStore.js';
import { FileEventStore } from './infrastructure/events/FileEventStore.js';
import { RealDeterministicTestRunner } from './infrastructure/testing/RealDeterministicTestRunner.js';
import { PiAgentRunner } from './infrastructure/pi/PiAgentRunner.js';
import { GitKnowledgeProvider } from './infrastructure/knowledge/GitKnowledgeProvider.js';
import { PathCapabilityEnforcer } from './domain/repository/PathCapability.js';
import { AgentPromptFactory } from './agents/AgentPrompts.js';
import { WorkflowState } from './domain/workflow/WorkflowState.js';
import { ProjectDiscoveryService } from './domain/project/ProjectDiscovery.js';
import { ProjectIntakeService } from './domain/project/ProjectIntake.js';

export default function hitmHarnessExtension(pi: ExtensionAPI): void {
  const root = process.cwd();
  const validator = new ArtifactValidator();
  const artifactStore = new FileArtifactStore(validator);
  const eventStore = new FileEventStore();
  const testRunner = new RealDeterministicTestRunner(root);
  const agentRunner = new PiAgentRunner(root);

  // Discover entry mode & repository state on startup (§6)
  const discovery = ProjectDiscoveryService.inspect(root);
  const workflowId = 'pirunner-canonical';

  const controller = new WorkflowController(
    workflowId,
    artifactStore as any,
    eventStore as any,
    testRunner,
    agentRunner,
    {},
    'PROJECT_DISCOVERY'
  );
  controller.setRepositorySnapshot(discovery.repositorySnapshot);

  let activeAgentId = '0012';

  function syncAgentToState(state: WorkflowState): string {
    switch (state) {
      case 'PROJECT_DISCOVERY':
      case 'PROJECT_INTAKE':
      case 'PROJECT_BASELINE': return '0000';
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

  // Auto-advance discovery if at initial PROJECT_DISCOVERY state
  if (controller.getState() === 'PROJECT_DISCOVERY') {
    if (discovery.entryMode === 'RESUME_WORKFLOW') {
      controller.transition('STATE_RECOVERY', { actorType: 'SYSTEM', actorId: '0000' }, { metadata: { entryMode: 'RESUME_WORKFLOW' } })
        .then(() => controller.transition('STATE_VALIDATION', { actorType: 'SYSTEM', actorId: '0000' }))
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

  activeAgentId = syncAgentToState(controller.getState());

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

  // 2. Command: /hitm status
  pi.registerCommand('hitm-status', {
    description: 'Display current HITM workflow state, entry mode, and active agent',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const state = controller.getState();
      activeAgentId = syncAgentToState(state);
      ctx.ui.notify(
        `State: [${state}] | Mode: ${discovery.entryMode} | Agent: ${activeAgentId} | Events: ${eventStore.getNextSequence(workflowId)}`,
        'info'
      );
    }
  });

  // 3. Command: /hitm-prompt
  pi.registerCommand('hitm-prompt', {
    description: 'View layered governance sub-prompt for the currently active agent',
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

  // 5. Command: /hitm-test
  pi.registerCommand('hitm-test', {
    description: 'Trigger authoritative deterministic TestRunner on current workspace',
    handler: async (_args: string, ctx: ExtensionContext) => {
      ctx.ui.notify('Executing deterministic test suite against active workspace...', 'info');
      try {
        const result = await testRunner.execute({
          workflowId,
          taskId: 'local-test',
          testSpecificationArtifactId: 'art-live',
          testSuiteContentHash: '',
          repositoryRevision: discovery.repositorySnapshot.headSha,
          dependencyLockHash: 'live-lock',
          executionCommand: 'npm test'
        });
        if (result.status === 'PASSED') {
          ctx.ui.notify(`All authoritative tests PASSED (Suite Hash: ${result.testSuiteContentHash.slice(0, 12)}...)`, 'info');
        } else {
          ctx.ui.notify(`Tests FAILED: ${result.rawOutput.slice(0, 200)}...`, 'error');
        }
      } catch (err: any) {
        ctx.ui.notify(`TestRunner Error: ${err.message}`, 'error');
      }
    }
  });
}
