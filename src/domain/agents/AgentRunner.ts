export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentInvocation {
  invocationId: string;
  agentId: string;
  workflowId: string;
  taskId: string;
  prompt: string;
  contextArtifactIds: string[];
}

export interface AgentEvent {
  invocationId: string;
  type: 'TEXT_DELTA' | 'TOOL_CALL' | 'COMPLETED' | 'FAILED';
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface AgentExecution {
  invocationId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  outputArtifactId?: string;
  rawOutput?: string;
}

export interface AgentRunner {
  start(invocation: AgentInvocation): Promise<AgentExecution>;
  send(invocationId: string, message: AgentMessage): Promise<void>;
  cancel(invocationId: string): Promise<void>;
  observe(invocationId: string): AsyncIterable<AgentEvent>;
  close(invocationId: string): Promise<void>;
}
