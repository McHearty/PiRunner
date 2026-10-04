import { WorkflowEvent } from '../workflow/WorkflowEvent.js';
import { SequenceOrderError } from '../workflow/WorkflowReducer.js';

export class EventStore {
  private readonly events: WorkflowEvent[] = [];

  public append(event: WorkflowEvent): void {
    const expectedSeq = this.events.length;
    if (event.sequence !== expectedSeq) {
      throw new SequenceOrderError(expectedSeq, event.sequence);
    }

    this.events.push(Object.freeze({ ...event }));
  }

  public getEvents(workflowId?: string): readonly WorkflowEvent[] {
    if (workflowId) {
      return this.events.filter(e => e.workflowId === workflowId);
    }
    return [...this.events];
  }

  public getNextSequence(): number {
    return this.events.length;
  }
}
