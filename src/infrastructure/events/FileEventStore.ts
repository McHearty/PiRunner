import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WorkflowEvent } from '../../domain/workflow/WorkflowEvent.js';
import { SequenceOrderError } from '../../domain/workflow/WorkflowReducer.js';

export class FileEventStore {
  private readonly filePath: string;
  private readonly events: WorkflowEvent[] = [];

  constructor(storageDir: string = join(process.cwd(), '.hitm')) {
    this.filePath = join(storageDir, 'events.jsonl');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return;
    const lines = readFileSync(this.filePath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const event: WorkflowEvent = JSON.parse(line);
      this.events.push(Object.freeze(event));
    }
  }

  public append(event: WorkflowEvent): void {
    const workflowEvents = this.getEvents(event.workflowId);
    const expectedSeq = workflowEvents.length;
    if (event.sequence !== expectedSeq) {
      throw new SequenceOrderError(expectedSeq, event.sequence);
    }
    this.events.push(Object.freeze({ ...event }));
    appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8');
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
