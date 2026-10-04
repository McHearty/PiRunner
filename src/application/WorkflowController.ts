import { WorkflowState } from '../domain/workflow/WorkflowState.js';
import { WorkflowEvent } from '../domain/workflow/WorkflowEvent.js';
import { WorkflowConfig, DEFAULT_WORKFLOW_CONFIG } from '../domain/workflow/WorkflowConfig.js';
import { findTransition } from '../domain/workflow/WorkflowTransition.js';
import { applyWorkflowEvent, reduceWorkflowEvents } from '../domain/workflow/WorkflowReducer.js';
import { ArtifactStore } from '../domain/artifacts/ArtifactStore.js';
import { EventStore } from '../domain/events/EventStore.js';
import { TestRunner, TestExecutionRequest, TestExecutionResultData } from '../domain/testing/TestRunner.js';
import { AgentRunner } from '../domain/agents/AgentRunner.js';
import { PathCapabilityEnforcer } from '../domain/repository/PathCapability.js';
import { GuardContext, RepositorySnapshot, GUARDS } from '../domain/workflow/Guards.js';
import { GitRepository } from '../infrastructure/git/GitRepository.js';
import { TestSuiteLock } from '../domain/testing/TestSuiteLock.js';

export class GuardCheckError extends Error {
  constructor(public readonly guardId: string, public readonly description: string, public readonly reason: string) {
    super(`Guard check failed [${guardId}]: ${reason} (${description})`);
    this.name = 'GuardCheckError';
  }
}

export class WorkflowController {
  private currentState: WorkflowState;
  private readonly workflowId: string;
  private readonly config: WorkflowConfig;
  private readonly gitRepo: GitRepository;
  private repositorySnapshot?: RepositorySnapshot;

  constructor(
    workflowId: string,
    private readonly artifactStore: ArtifactStore,
    private readonly eventStore: EventStore,
    private readonly testRunner: TestRunner,
    private readonly agentRunner: AgentRunner,
    config: Partial<WorkflowConfig> = {},
    initialState: WorkflowState = 'PROJECT_DISCOVERY',
    workspaceRoot: string = process.cwd()
  ) {
    this.workflowId = workflowId;
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
    this.gitRepo = new GitRepository(workspaceRoot);
    // Explicit single entry point: Controller starts strictly at initialState (§5, §18)
    this.currentState = initialState;
  }

  public getState(): WorkflowState {
    return this.currentState;
  }

  public getWorkflowId(): string {
    return this.workflowId;
  }

  public getConfig(): WorkflowConfig {
    return { ...this.config };
  }

  public setRepositorySnapshot(snapshot: RepositorySnapshot): void {
    this.repositorySnapshot = snapshot;
  }

  public async transition(
    targetState: WorkflowState,
    actor: { actorType: 'HUMAN' | 'AGENT' | 'SYSTEM'; actorId: string },
    options: {
      humanApproved?: boolean;
      artifactIds?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<WorkflowEvent> {
    const transitionDef = findTransition(this.currentState, targetState);
    if (!transitionDef) {
      throw new Error(`Illegal state transition from ${this.currentState} to ${targetState}`);
    }

    if (transitionDef.humanApproval === 'ALWAYS' && !options.humanApproved) {
      throw new Error(`Transition ${transitionDef.id} (${this.currentState} -> ${targetState}) mandates explicit human approval`);
    }

    const freshRepoSnapshot = this.gitRepo.getFreshSnapshot();
    const effectiveRepo = this.repositorySnapshot || freshRepoSnapshot;

    const guardContext: GuardContext = {
      currentState: this.currentState,
      targetState,
      artifacts: {
        get: (id) => this.artifactStore.get(id),
        getByType: (type) => this.artifactStore.getByType(type),
        getLatestAccepted: (type) => this.artifactStore.getLatestAccepted(type)
      },
      eventHistory: this.eventStore.getEvents(this.workflowId),
      config: this.config,
      repository: effectiveRepo,
      referencedArtifactIds: options.artifactIds,
      metadata: options.metadata
    };

    // FAIL CLOSED: Evaluate all guards; throw if guard or evaluator is missing (§21, §22)
    for (const guardDef of transitionDef.guards) {
      const activeGuard = GUARDS[guardDef.id];
      if (!activeGuard || !activeGuard.evaluate) {
        throw new GuardCheckError(guardDef.id, guardDef.description, 'Guard has no executable evaluator (fail-closed)');
      }
      const result = activeGuard.evaluate(guardContext);
      if (!result.satisfied) {
        throw new GuardCheckError(guardDef.id, guardDef.description, result.reason);
      }
    }

    // Persist TestSuiteLock on TEST_READY derived strictly from accepted TestSpecification (§30)
    if (targetState === 'TEST_READY') {
      const testSpec = this.artifactStore.getLatestAccepted('TestSpecification');
      const specPayload: any = testSpec?.payload;
      const canonicalHash = specPayload?.testSuiteContentHash || options.metadata?.testSuiteHash;

      if (!canonicalHash || canonicalHash.length !== 64) {
        throw new Error('Cannot lock test suite: TestSpecification does not contain valid 64-char testSuiteContentHash');
      }

      TestSuiteLock.createLock({
        workflowId: this.workflowId,
        testSpecificationArtifactId: testSpec?.artifactId || options.artifactIds?.[0] || 'art-test-spec',
        testSuiteContentHash: canonicalHash,
        lockedAt: new Date().toISOString(),
        fileCount: specPayload?.testCases?.length || 1
      });
    }

    const event: WorkflowEvent = {
      eventId: `evt-${this.workflowId}-${this.eventStore.getNextSequence(this.workflowId)}`,
      workflowId: this.workflowId,
      sequence: this.eventStore.getNextSequence(this.workflowId),
      type: `TRANSITION_${transitionDef.id}`,
      actorType: actor.actorType,
      actorId: actor.actorId,
      timestamp: new Date().toISOString(),
      stateBefore: this.currentState,
      stateAfter: targetState,
      artifactIds: options.artifactIds || [],
      metadata: options.metadata || {}
    };

    // Transactional append: write durable journal FIRST, update memory ONLY on success (§15)
    this.eventStore.append(event);
    this.currentState = applyWorkflowEvent(this.currentState, event);

    return event;
  }

  public executeAuthoritativeTests(request: Omit<TestExecutionRequest, 'workflowId'>): Promise<TestExecutionResultData> {
    return this.testRunner.execute({
      ...request,
      workflowId: this.workflowId
    });
  }

  public validateAgentFileMutations(agentId: string, changedFiles: string[]) {
    return PathCapabilityEnforcer.validateMutations(agentId, changedFiles);
  }

  public reconstructState(): WorkflowState {
    const events = this.eventStore.getEvents(this.workflowId);
    if (events.length === 0) return this.currentState;
    return reduceWorkflowEvents(events[0].stateBefore, events);
  }
}
