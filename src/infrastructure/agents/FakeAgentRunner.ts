import { AgentRunner, AgentInvocation, AgentExecution, AgentMessage, AgentEvent } from '../../domain/agents/AgentRunner.js';

export class FakeAgentRunner implements AgentRunner {
  private readonly executions = new Map<string, AgentExecution>();
  private readonly programmedResponses = new Map<string, AgentExecution>();

  public setNextExecution(agentId: string, execution: Partial<AgentExecution>): void {
    this.programmedResponses.set(agentId, {
      invocationId: execution.invocationId || 'mock-inv',
      status: execution.status || 'COMPLETED',
      outputArtifactId: execution.outputArtifactId,
      rawOutput: execution.rawOutput || 'Simulated agent completion'
    });
  }

  public async start(invocation: AgentInvocation): Promise<AgentExecution> {
    const programmed = this.programmedResponses.get(invocation.agentId);
    const exec: AgentExecution = programmed
      ? { ...programmed, invocationId: invocation.invocationId }
      : {
          invocationId: invocation.invocationId,
          status: 'COMPLETED',
          outputArtifactId: `art-${invocation.invocationId}`,
          rawOutput: 'Default simulated output'
        };

    this.executions.set(invocation.invocationId, exec);
    return exec;
  }

  public async send(invocationId: string, message: AgentMessage): Promise<void> {}
  public async cancel(invocationId: string): Promise<void> {
    const exec = this.executions.get(invocationId);
    if (exec) exec.status = 'CANCELLED';
  }

  public async *observe(invocationId: string): AsyncIterable<AgentEvent> {
    yield {
      invocationId,
      type: 'COMPLETED',
      payload: {},
      timestamp: new Date().toISOString()
    };
  }

  public async close(invocationId: string): Promise<void> {
    this.executions.delete(invocationId);
  }
}
