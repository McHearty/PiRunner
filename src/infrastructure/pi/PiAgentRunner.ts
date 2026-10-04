import { AgentRunner, AgentInvocation, AgentExecution, AgentMessage, AgentEvent } from '../../domain/agents/AgentRunner.js';
import { PathCapabilityEnforcer } from '../../domain/repository/PathCapability.js';
import { AGENT_REGISTRY } from '../../agents/AgentDefinitions.js';

export interface PiSessionLike {
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

export type PiSessionFactory = (options: {
  cwd: string;
  systemPrompt: string;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}) => Promise<PiSessionLike>;

export class PiAgentRunner implements AgentRunner {
  private readonly activeSessions = new Map<string, PiSessionLike>();
  private readonly executionStates = new Map<string, AgentExecution>();
  private readonly eventQueues = new Map<string, AgentEvent[]>();

  constructor(
    private readonly workspaceRoot: string = process.cwd(),
    private readonly sessionFactory?: PiSessionFactory
  ) {}

  public async start(invocation: AgentInvocation): Promise<AgentExecution> {
    const agentSpec = AGENT_REGISTRY[invocation.agentId];
    const systemPrompt = agentSpec ? agentSpec.systemPrompt : 'You are an autonomous engineering agent.';
    const execution: AgentExecution = {
      invocationId: invocation.invocationId,
      status: 'RUNNING'
    };
    this.executionStates.set(invocation.invocationId, execution);
    this.eventQueues.set(invocation.invocationId, []);

    const toolInterceptor = async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
      // 1. File write/edit protection
      if (toolName === 'write' || toolName === 'edit') {
        const filePath = (args.path || args.filePath || '') as string;
        if (!PathCapabilityEnforcer.isWriteAllowed(invocation.agentId, filePath)) {
          this.emitEvent(invocation.invocationId, {
            invocationId: invocation.invocationId,
            type: 'FAILED',
            payload: { error: `Path capability violation: Agent ${invocation.agentId} cannot write to ${filePath}` },
            timestamp: new Date().toISOString()
          });
          return false;
        }
      }

      // 2. Command/Shell execution capability protection (§51)
      if (toolName === 'bash' || toolName === 'exec' || toolName === 'shell') {
        const cmd = (args.command || args.cmd || '') as string;
        if (cmd.includes('git push')) {
          this.emitEvent(invocation.invocationId, {
            invocationId: invocation.invocationId,
            type: 'FAILED',
            payload: { error: `Command violation: Agent ${invocation.agentId} is strictly forbidden from executing remote push` },
            timestamp: new Date().toISOString()
          });
          return false;
        }
      }

      return true;
    };

    if (this.sessionFactory) {
      const session = await this.sessionFactory({
        cwd: this.workspaceRoot,
        systemPrompt,
        onTextDelta: (delta: string) => {
          this.emitEvent(invocation.invocationId, {
            invocationId: invocation.invocationId,
            type: 'TEXT_DELTA',
            payload: { delta },
            timestamp: new Date().toISOString()
          });
        },
        onToolCall: toolInterceptor
      });
      this.activeSessions.set(invocation.invocationId, session);
      await session.prompt(invocation.prompt);
      execution.status = 'COMPLETED';
      execution.rawOutput = `Agent ${invocation.agentId} completed task ${invocation.taskId}`;
    } else {
      try {
        const piModule: any = await import('@earendil-works/pi-coding-agent');
        if (typeof piModule.createAgentSession === 'function') {
          const { session } = await piModule.createAgentSession({
            cwd: this.workspaceRoot,
            systemPrompt
          });
          this.activeSessions.set(invocation.invocationId, session);
          await session.prompt(invocation.prompt);
          execution.status = 'COMPLETED';
        }
      } catch (err: any) {
        // EPISTEMIC HONESTY: Mark FAILED on runtime absence, never fabricate success (§2)
        execution.status = 'FAILED';
        execution.rawOutput = `Pi agent runtime unavailable: ${err.message}`;
        this.emitEvent(invocation.invocationId, {
          invocationId: invocation.invocationId,
          type: 'FAILED',
          payload: { error: execution.rawOutput },
          timestamp: new Date().toISOString()
        });
      }
    }

    return execution;
  }

  public async send(invocationId: string, message: AgentMessage): Promise<void> {
    const session = this.activeSessions.get(invocationId);
    if (session) {
      await session.prompt(message.content);
    }
  }

  public async cancel(invocationId: string): Promise<void> {
    const session = this.activeSessions.get(invocationId);
    if (session) {
      await session.abort();
    }
    const exec = this.executionStates.get(invocationId);
    if (exec) {
      exec.status = 'CANCELLED';
    }
  }

  public async *observe(invocationId: string): AsyncIterable<AgentEvent> {
    const queue = this.eventQueues.get(invocationId) || [];
    for (const evt of queue) {
      yield evt;
    }
  }

  public async close(invocationId: string): Promise<void> {
    const session = this.activeSessions.get(invocationId);
    if (session) {
      await session.dispose();
      this.activeSessions.delete(invocationId);
    }
    this.executionStates.delete(invocationId);
    this.eventQueues.delete(invocationId);
  }

  private emitEvent(invocationId: string, event: AgentEvent): void {
    const queue = this.eventQueues.get(invocationId);
    if (queue) {
      queue.push(event);
    }
  }
}
