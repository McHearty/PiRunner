import { WorkflowState } from './WorkflowState.js';

export interface WorkflowEvent {
  eventId: string;
  workflowId: string;
  sequence: number; // monotonic per workflow, starting at 0
  taskId?: string;
  type: string;
  actorType: 'HUMAN' | 'AGENT' | 'SYSTEM';
  actorId: string;
  timestamp: string; // ISO-8601
  stateBefore: WorkflowState;
  stateAfter: WorkflowState;
  artifactIds: string[];
  metadata: Record<string, unknown>;
}
