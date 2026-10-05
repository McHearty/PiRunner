import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WorkflowEvent } from '../../domain/workflow/WorkflowEvent.js';
import { SequenceOrderError } from '../../domain/workflow/WorkflowReducer.js';

export class FileEventStore {
  private readonly filePath: string;
  private events: WorkflowEvent[] = [];

  constructor(storageDir: string = join(process.cwd(), '.hitm')) {
    this.filePath = join(storageDir, 'events.jsonl');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return;
    this.events = [];
    const lines = readFileSync(this.filePath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      try {
        const event: WorkflowEvent = JSON.parse(line);
        this.events.push(Object.freeze(event));
      } catch {}
    }
  }

  /**
   * DANGEROUS: Deletes all events from the journal. Intended for test fixtures only.
   * In production, canonical workflow history must be append-only; never rewrite or truncate.
   * Use of this method in production violates the invariant:
   * "Conflict resolution may append evidence; it may never rewrite historical evidence."
   */
  public resetJournal(): void {
    this.events = [];
    writeFileSync(this.filePath, '', 'utf8');
  }

  public append(event: WorkflowEvent): void {
    const workflowEvents = this.getEvents(event.workflowId);
    const expectedSeq = workflowEvents.length;
    if (event.sequence !== expectedSeq) {
      throw new SequenceOrderError(expectedSeq, event.sequence);
    }

    appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8');
    this.events.push(Object.freeze({ ...event }));
  }

  public getEvents(workflowId?: string): readonly WorkflowEvent[] {
    if (workflowId) {
      return this.events.filter(e => e.workflowId === workflowId);
    }
    return [...this.events];
  }

  public getNextSequence(workflowId?: string): number {
    return this.getEvents(workflowId).length;
  }
}
