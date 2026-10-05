import { join } from 'node:path';
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
import { RepositoryPort } from '../domain/repository/RepositoryPort.js';
import { GitRepository } from '../infrastructure/git/GitRepository.js';
import { TestSuiteLock } from '../domain/testing/TestSuiteLock.js';
import { CanonicalRole, AgentRosterService } from '../domain/agents/AgentIdentity.js';

export class GuardCheckError extends Error {
  constructor(public readonly guardId: string, public readonly description: string, public readonly reason: string) {
    super(`Guard check failed [${guardId}]: ${reason} (${description})`);
    this.name = 'GuardCheckError';
  }
}

export class AgentAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentAuthorityError';
  }
}

export class WorkflowController {
  private currentState: WorkflowState;
  private readonly workflowId: string;
  private readonly config: WorkflowConfig;
  private readonly repository: RepositoryPort;
  private readonly workspaceRoot: string;
  private repositorySnapshot?: RepositorySnapshot;

  // Normative Agent Authority Matrix (§26): Maps origin states to authorized actor roles
  private static readonly STATE_AUTHORITY_MAP: Partial<Record<WorkflowState, CanonicalRole>> = {
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

  constructor(
    workflowId: string,
    private readonly artifactStore: ArtifactStore,
    private readonly eventStore: EventStore,
    private readonly testRunner: TestRunner,
    private readonly agentRunner: AgentRunner,
    config: Partial<WorkflowConfig> = {},
    initialState: WorkflowState = 'PROJECT_DISCOVERY',
    repository?: RepositoryPort,
    workspaceRoot: string = process.cwd()
  ) {
    this.workflowId = workflowId;
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
    this.workspaceRoot = workspaceRoot;
    this.repository = repository || new GitRepository(workspaceRoot);
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

    // 1. Enforce Human Approval policy
    if (transitionDef.humanApproval === 'ALWAYS' && !options.humanApproved) {
      throw new Error(`Transition ${transitionDef.id} (${this.currentState} -> ${targetState}) mandates explicit human approval`);
    }

    // 2. Enforce Agent Authority Matrix (§26): Agents cannot act on behalf of other agents
    if (actor.actorType === 'AGENT') {
      const authorizedRole = WorkflowController.STATE_AUTHORITY_MAP[this.currentState];
      if (authorizedRole) {
        const callingRole = this.resolveAgentRole(actor.actorId);
        if (callingRole !== authorizedRole) {
          throw new AgentAuthorityError(
            `Agent authority violation: Agent [${actor.actorId}] (${callingRole}) is forbidden from acting on behalf of [${authorizedRole}] in state [${this.currentState}]`
          );
        }
      }
    }

    const freshRepoSnapshot = this.repository.getFreshSnapshot();
    const effectiveRepo = this.repositorySnapshot || freshRepoSnapshot;

    const guardContext: GuardContext = {
      currentState: this.currentState,
      targetState,
      artifacts: {
        get: (id) => this.artifactStore.get(id),
        getByType: (type) => this.artifactStore.getByType(type),
        getLatestAccepted: (type) => this.artifactStore.getLatestAccepted(type, this.workflowId)
      },
      eventHistory: this.eventStore.getEvents(this.workflowId),
      config: this.config,
      repository: effectiveRepo,
      referencedArtifactIds: options.artifactIds,
      workspaceRoot: this.workspaceRoot,
      metadata: {
        ...options.metadata,
        humanApproved: options.humanApproved === true
      }
    };

    // FAIL CLOSED: Evaluate all guards
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
      const testSpec = this.artifactStore.getLatestAccepted('TestSpecification', this.workflowId);
      const specPayload: any = testSpec?.payload;
      const canonicalHash = specPayload?.testSuiteContentHash || options.metadata?.testSuiteHash;

      if (!canonicalHash || canonicalHash.length !== 64) {
        throw new Error('Cannot lock test suite: TestSpecification does not contain valid 64-char testSuiteContentHash');
      }

      TestSuiteLock.createLock(
        {
          workflowId: this.workflowId,
          testSpecificationArtifactId: testSpec?.artifactId || options.artifactIds?.[0] || 'art-test-spec',
          testSuiteContentHash: canonicalHash,
          lockedAt: new Date().toISOString(),
          fileCount: specPayload?.testCases?.length || 1
        },
        join(this.workspaceRoot, '.hitm')
      );
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

    this.eventStore.append(event);
    this.currentState = applyWorkflowEvent(this.currentState, event);

    return event;
  }

  private resolveAgentRole(agentId: string): CanonicalRole {
    const roles: CanonicalRole[] = [
      'CONCEPT', 'SPECIFICATION', 'PLANNING', 'KNOWLEDGE',
      'TEST_AUTHORING', 'IMPLEMENTATION', 'TRIAGE', 'REVIEW',
      'DEVLOG', 'SKILL_ARCHITECT', 'PUBLICATION'
    ];
    if (roles.includes(agentId as CanonicalRole)) {
      return agentId as CanonicalRole;
    }

    try {
      const roster = AgentRosterService.getOrGenerateRoster(this.workspaceRoot);
      for (const entry of Object.values(roster)) {
        if (entry.id === agentId) return entry.canonicalRole;
      }
    } catch {}

    const legacyMap: Record<string, CanonicalRole> = {
      '0012': 'CONCEPT', '0024': 'SPECIFICATION', '0036': 'PLANNING',
      '0048': 'KNOWLEDGE', '0060': 'IMPLEMENTATION', '0072': 'TRIAGE',
      '0084': 'REVIEW', '0096': 'DEVLOG', '0108': 'PUBLICATION',
      '0120': 'TEST_AUTHORING', '0132': 'SKILL_ARCHITECT'
    };
    return legacyMap[agentId] || 'CONCEPT';
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
