import { WorkflowState } from '../domain/workflow/WorkflowState.js';
import { WorkflowEvent } from '../domain/workflow/WorkflowEvent.js';
import { WorkflowConfig, DEFAULT_WORKFLOW_CONFIG } from '../domain/workflow/WorkflowConfig.js';
import { findTransition, isTransitionLegal, TransitionDefinition } from '../domain/workflow/WorkflowTransition.js';
import { applyWorkflowEvent, reduceWorkflowEvents } from '../domain/workflow/WorkflowReducer.js';
import { ArtifactStore, StoredArtifact } from '../domain/artifacts/ArtifactStore.js';
import { EventStore } from '../domain/events/EventStore.js';
import { TestRunner, TestExecutionRequest, TestExecutionResultData } from '../domain/testing/TestRunner.js';
import { AgentRunner } from '../domain/agents/AgentRunner.js';
import { PathCapabilityEnforcer } from '../domain/repository/PathCapability.js';

export class WorkflowController {
  private currentState: WorkflowState;
  private readonly workflowId: string;
  private readonly config: WorkflowConfig;

  constructor(
    workflowId: string,
    private readonly artifactStore: ArtifactStore,
    private readonly eventStore: EventStore,
    private readonly testRunner: TestRunner,
    private readonly agentRunner: AgentRunner,
    config: Partial<WorkflowConfig> = {}
  ) {
    this.workflowId = workflowId;
    this.currentState = 'CONCEPT';
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
  }

  public getState(): WorkflowState {
    return this.currentState;
  }

  public getConfig(): WorkflowConfig {
    return { ...this.config };
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

    // Enforce Human Approval policy
    if (transitionDef.humanApproval === 'ALWAYS' && !options.humanApproved) {
      throw new Error(`Transition ${transitionDef.id} (${this.currentState} -> ${targetState}) mandates explicit human approval`);
    }

    const event: WorkflowEvent = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workflowId: this.workflowId,
      sequence: this.eventStore.getNextSequence(),
      type: `TRANSITION_${transitionDef.id}`,
      actorType: actor.actorType,
      actorId: actor.actorId,
      timestamp: new Date().toISOString(),
      stateBefore: this.currentState,
      stateAfter: targetState,
      artifactIds: options.artifactIds || [],
      metadata: options.metadata || {}
    };

    // Apply pure reducer to advance state
    this.currentState = applyWorkflowEvent(this.currentState, event);
    this.eventStore.append(event);

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
    return reduceWorkflowEvents('CONCEPT', events);
  }
}
