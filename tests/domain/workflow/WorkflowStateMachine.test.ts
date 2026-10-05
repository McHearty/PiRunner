import { describe, it, expect } from 'vitest';
import { isTransitionLegal, findTransition, TRANSITION_REGISTRY } from '../../../src/domain/workflow/WorkflowTransition.js';
import { GUARDS } from '../../../src/domain/workflow/Guards.js';
import { applyWorkflowEvent, reduceWorkflowEvents, WorkflowTransitionError, SequenceOrderError } from '../../../src/domain/workflow/WorkflowReducer.js';
import { WorkflowEvent } from '../../../src/domain/workflow/WorkflowEvent.js';

describe('Workflow Transition Registry (Normative §11, §24)', () => {
  it('permits valid normative transitions', () => {
    expect(isTransitionLegal('PROJECT_DISCOVERY', 'CONCEPT')).toBe(true);
    expect(isTransitionLegal('CONCEPT', 'CONCEPT_REVIEW')).toBe(true);
    expect(isTransitionLegal('CONCEPT_REVIEW', 'SPECIFICATION')).toBe(true);
    expect(isTransitionLegal('SPRINT_READY', 'TEST_AUTHORING')).toBe(true);
    expect(isTransitionLegal('TEST_AUTHORING', 'TEST_READY')).toBe(true);
    expect(isTransitionLegal('TEST_READY', 'IMPLEMENTATION')).toBe(true);
    expect(isTransitionLegal('IMPLEMENTATION', 'COMMIT_CREATED')).toBe(true);
    expect(isTransitionLegal('COMMIT_CREATED', 'REVIEW')).toBe(true);
    expect(isTransitionLegal('REVIEW', 'SPRINT_ACCEPTED')).toBe(true);
  });

  it('strictly rejects illegal transitions', () => {
    // Cannot skip test authoring to implementation directly
    expect(isTransitionLegal('SPRINT_READY', 'IMPLEMENTATION')).toBe(false);
    // Implementation cannot skip commit directly to review
    expect(isTransitionLegal('IMPLEMENTATION', 'REVIEW')).toBe(false);
    // Review cannot directly push
    expect(isTransitionLegal('REVIEW', 'REMOTE_PUBLISHED')).toBe(false);
    // Concept cannot jump to implementation
    expect(isTransitionLegal('CONCEPT', 'IMPLEMENTATION')).toBe(false);
  });

  it('permits wildcard recovery transitions (* -> ARTIFACT_INVALID, * -> ABORT)', () => {
    expect(isTransitionLegal('IMPLEMENTATION', 'ARTIFACT_INVALID')).toBe(true);
    expect(isTransitionLegal('TEST_AUTHORING', 'REPOSITORY_CONFLICT')).toBe(true);
    expect(isTransitionLegal('REVIEW', 'ABORT')).toBe(true);
  });

  it('enforces human approval requirements on specific transitions', () => {
    const t011 = findTransition('CONCEPT_REVIEW', 'SPECIFICATION');
    expect(t011?.humanApproval).toBe('ALWAYS');

    const t050 = findTransition('TEST_READY', 'IMPLEMENTATION');
    expect(t050?.humanApproval).toBe('NEVER');

    const t081 = findTransition('PUSH_GATE', 'REMOTE_PUBLISHED');
    expect(t081?.humanApproval).toBe('ALWAYS');
  });
});

describe('Workflow Pure Reducer (Normative §9, §15)', () => {
  const createEvent = (seq: number, before: any, after: any): WorkflowEvent => ({
    eventId: `evt-wf-1-${seq}`,
    workflowId: 'wf-1',
    sequence: seq,
    type: 'STATE_CHANGED',
    actorType: 'SYSTEM',
    actorId: '0000',
    timestamp: new Date().toISOString(),
    stateBefore: before,
    stateAfter: after,
    artifactIds: [],
    metadata: {}
  });

  it('reconstitutes workflow state accurately across legal sequential events', () => {
    const events: WorkflowEvent[] = [
      createEvent(0, 'PROJECT_DISCOVERY', 'CONCEPT'),
      createEvent(1, 'CONCEPT', 'CONCEPT_REVIEW'),
      createEvent(2, 'CONCEPT_REVIEW', 'SPECIFICATION'),
      createEvent(3, 'SPECIFICATION', 'SPECIFICATION_REVIEW'),
      createEvent(4, 'SPECIFICATION_REVIEW', 'PLANNING'),
      createEvent(5, 'PLANNING', 'KNOWLEDGE_SYNC'),
      createEvent(6, 'KNOWLEDGE_SYNC', 'SPRINT_READY'),
      createEvent(7, 'SPRINT_READY', 'TEST_AUTHORING'),
      createEvent(8, 'TEST_AUTHORING', 'TEST_READY'),
      createEvent(9, 'TEST_READY', 'IMPLEMENTATION')
    ];

    const finalState = reduceWorkflowEvents('PROJECT_DISCOVERY', events);
    expect(finalState).toBe('IMPLEMENTATION');
  });

  it('throws WorkflowTransitionError when an illegal transition is reduced', () => {
    const illegalEvents: WorkflowEvent[] = [
      createEvent(0, 'CONCEPT', 'IMPLEMENTATION')
    ];

    expect(() => reduceWorkflowEvents('CONCEPT', illegalEvents)).toThrow(WorkflowTransitionError);
  });

  it('throws SequenceOrderError if an event sequence breaks monotonicity', () => {
    const nonMonotonicEvents: WorkflowEvent[] = [
      createEvent(0, 'CONCEPT', 'CONCEPT_REVIEW'),
      createEvent(2, 'CONCEPT_REVIEW', 'SPECIFICATION')
    ];

    expect(() => reduceWorkflowEvents('CONCEPT', nonMonotonicEvents)).toThrow(SequenceOrderError);
  });
});

describe('Transition Registry Fail-Closed Integrity (§21, §22)', () => {
  it('verifies every guard referenced across all transitions exists in GUARDS and is executable', () => {
    for (const transition of TRANSITION_REGISTRY) {
      for (const guardDef of transition.guards) {
        const registered = GUARDS[guardDef.id];
        expect(registered, `Guard [${guardDef.id}] on transition ${transition.id} must be registered`).toBeDefined();
        expect(typeof registered.evaluate, `Guard [${guardDef.id}] on transition ${transition.id} must have executable evaluate()`).toBe('function');
      }
    }
  });
});

describe('Repository Conflict Resolution Transitions (§9, §38)', () => {
  it('permits legal exit transitions out of REPOSITORY_CONFLICT (T-103A, T-103B, T-103C)', () => {
    expect(isTransitionLegal('REPOSITORY_CONFLICT', 'PROJECT_INTAKE')).toBe(true);
    expect(isTransitionLegal('REPOSITORY_CONFLICT', 'STATE_VALIDATION')).toBe(true);
    expect(isTransitionLegal('REPOSITORY_CONFLICT', 'KNOWLEDGE_SYNC')).toBe(true);
    expect(isTransitionLegal('REPOSITORY_CONFLICT', 'ABORT')).toBe(true);
  });
});

describe('Planning Approval Direct Transitions (§27)', () => {
  it('permits direct promotion from PLANNING to SPRINT_READY via T-030B', () => {
    expect(isTransitionLegal('PLANNING', 'SPRINT_READY')).toBe(true);
  });
});
