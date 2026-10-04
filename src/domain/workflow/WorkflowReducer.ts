import { WorkflowState } from './WorkflowState.js';
import { WorkflowEvent } from './WorkflowEvent.js';
import { findTransition } from './WorkflowTransition.js';

export class WorkflowTransitionError extends Error {
  constructor(public readonly from: WorkflowState, public readonly to: WorkflowState, message: string) {
    super(message);
    this.name = 'WorkflowTransitionError';
  }
}

export class SequenceOrderError extends Error {
  constructor(public readonly expected: number, public readonly received: number) {
    super(`Event sequence mismatch: expected ${expected}, received ${received}`);
    this.name = 'SequenceOrderError';
  }
}

export function applyWorkflowEvent(currentState: WorkflowState, event: WorkflowEvent): WorkflowState {
  if (event.stateBefore !== currentState) {
    throw new WorkflowTransitionError(
      currentState,
      event.stateAfter,
      `Event stateBefore (${event.stateBefore}) does not match current state (${currentState})`
    );
  }

  const transition = findTransition(event.stateBefore, event.stateAfter);
  if (!transition) {
    throw new WorkflowTransitionError(
      event.stateBefore,
      event.stateAfter,
      `Illegal transition from ${event.stateBefore} to ${event.stateAfter}`
    );
  }

  return event.stateAfter;
}

export function reduceWorkflowEvents(
  initialState: WorkflowState,
  events: readonly WorkflowEvent[]
): WorkflowState {
  let state = initialState;
  let expectedSeq = 0;

  for (const event of events) {
    if (event.sequence !== expectedSeq) {
      throw new SequenceOrderError(expectedSeq, event.sequence);
    }
    state = applyWorkflowEvent(state, event);
    expectedSeq++;
  }

  return state;
}
