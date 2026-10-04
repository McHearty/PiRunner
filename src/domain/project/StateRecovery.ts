import { WorkflowEvent } from '../workflow/WorkflowEvent.js';
import { WorkflowState } from '../workflow/WorkflowState.js';
import { reduceWorkflowEvents } from '../workflow/WorkflowReducer.js';
import { EventStore } from '../events/EventStore.js';

export interface StateRecoveryResult {
  recovered: boolean;
  canonicalState: WorkflowState;
  eventCount: number;
  lastEvent?: WorkflowEvent;
  error?: string;
}

export class StateRecoveryService {
  public static recover(eventStore: EventStore, workflowId: string): StateRecoveryResult {
    const events = eventStore.getEvents(workflowId);
    if (events.length === 0) {
      return {
        recovered: false,
        canonicalState: 'PROJECT_DISCOVERY',
        eventCount: 0,
        error: 'No events found in journal for workflow'
      };
    }

    try {
      const canonicalState = reduceWorkflowEvents(events[0].stateBefore, events);
      return {
        recovered: true,
        canonicalState,
        eventCount: events.length,
        lastEvent: events[events.length - 1]
      };
    } catch (err: any) {
      return {
        recovered: false,
        canonicalState: 'PROJECT_DISCOVERY',
        eventCount: events.length,
        error: `Event journal reduction failure: ${err.message}`
      };
    }
  }
}
