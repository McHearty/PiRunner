import { describe, it, expect } from 'vitest';
import { isTransitionLegal, findTransition } from '../../../src/domain/workflow/WorkflowTransition.js';
import { applyWorkflowEvent, reduceWorkflowEvents, WorkflowTransitionError, SequenceOrderError } from '../../../src/domain/workflow/WorkflowReducer.js';
import { WorkflowEvent } from '../../../src/domain/workflow/WorkflowEvent.js';

describe('Workflow Transition Registry (Normative §11)', () => {
  it('permits valid normative transitions', () => {
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
    const t002 = findTransition('CONCEPT_REVIEW', 'SPECIFICATION');
    expect(t002?.humanApproval).toBe('ALWAYS');

    const t030 = findTransition('TEST_READY', 'IMPLEMENTATION');
    expect(t030?.humanApproval).toBe('NEVER');

    const t061 = findTransition('PUSH_GATE', 'REMOTE_PUBLISHED');
    expect(t061?.humanApproval).toBe('ALWAYS');
  });
});

describe('Workflow Pure Reducer (Normative §9)', () => {
  const createEvent = (seq: number, before: any, after: any): WorkflowEvent => ({
    eventId: `evt-${seq}`,
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
      createEvent(0, 'CONCEPT', 'CONCEPT_REVIEW'),
      createEvent(1, 'CONCEPT_REVIEW', 'SPECIFICATION'),
      createEvent(2, 'SPECIFICATION', 'SPECIFICATION_REVIEW'),
      createEvent(3, 'SPECIFICATION_REVIEW', 'PLANNING'),
      createEvent(4, 'PLANNING', 'KNOWLEDGE_SYNC'),
      createEvent(5, 'KNOWLEDGE_SYNC', 'SPRINT_READY'),
      createEvent(6, 'SPRINT_READY', 'TEST_AUTHORING'),
      createEvent(7, 'TEST_AUTHORING', 'TEST_READY'),
      createEvent(8, 'TEST_READY', 'IMPLEMENTATION')
    ];

    const finalState = reduceWorkflowEvents('CONCEPT', events);
    expect(finalState).toBe('IMPLEMENTATION');
  });

  it('throws WorkflowTransitionError when an illegal transition is reduced', () => {
    const illegalEvents: WorkflowEvent[] = [
      createEvent(0, 'CONCEPT', 'IMPLEMENTATION') // Illegal jump
    ];

    expect(() => reduceWorkflowEvents('CONCEPT', illegalEvents)).toThrow(WorkflowTransitionError);
  });

  it('throws SequenceOrderError if an event sequence breaks monotonicity', () => {
    const nonMonotonicEvents: WorkflowEvent[] = [
      createEvent(0, 'CONCEPT', 'CONCEPT_REVIEW'),
      createEvent(2, 'CONCEPT_REVIEW', 'SPECIFICATION') // Skipped sequence 1
    ];

    expect(() => reduceWorkflowEvents('CONCEPT', nonMonotonicEvents)).toThrow(SequenceOrderError);
  });
});
