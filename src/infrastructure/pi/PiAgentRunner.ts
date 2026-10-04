import { AgentRunner, AgentInvocation, AgentExecution, AgentMessage, AgentEvent } from '../../domain/agents/AgentRunner.js';
import { PathCapabilityEnforcer } from '../../domain/repository/PathCapability.js';
import { AGENT_REGISTRY } from '../../agents/AgentDefinitions.js';

export interface PiSessionLike {
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
  subscribe?: (callback: (event: any) => void) => void;
  getLastAssistantText?: () => string;
}

export type PiSessionFactory = (options: {
  cwd: string;
  systemPrompt: string;
  invocationId: string;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}) => Promise<PiSessionLike>;

export class PiAgentRunner implements AgentRunner {
  private readonly activeSessions = new Map<string, PiSessionLike>();
  private readonly executionStates = new Map<string, AgentExecution>();
  private readonly eventQueues = new Map<string, AgentEvent[]>();
  private readonly activeInvocations = new Map<string, AgentInvocation>();

  constructor(
    private readonly workspaceRoot: string = process.cwd(),
    private readonly sessionFactory?: PiSessionFactory
  ) {}

  public getInvocation(invocationId: string): AgentInvocation | undefined {
    return this.activeInvocations.get(invocationId);
  }

  // FAIL CLOSED: Invocation ID is mandatory. No global or latest-active fallback (§51, §52)
  public authorizeToolCall(toolName: string, args: Record<string, unknown>, invocationId: string): boolean {
    if (!invocationId) {
      return false; // Fail closed: unidentifiable invocation
    }

    const invocation = this.activeInvocations.get(invocationId);
    if (!invocation) {
      return false; // Fail closed: unresolvable or inactive invocation
    }

    const agentId = invocation.agentId;

    if (toolName === 'write' || toolName === 'edit') {
      const filePath = (args.path || args.filePath || '') as string;
      return PathCapabilityEnforcer.isWriteAllowed(agentId, filePath);
    }

    if (toolName === 'bash' || toolName === 'exec' || toolName === 'shell') {
      const cmd = (args.command || args.cmd || '') as string;
      if (
        cmd.includes('git push') ||
        cmd.includes('git reset --hard') ||
        cmd.includes('git checkout -f') ||
        cmd.includes('rm -rf src') ||
        cmd.includes('rm -rf tests')
      ) {
        return false;
      }
    }

    return true;
  }

  public async start(invocation: AgentInvocation): Promise<AgentExecution> {
    const agentSpec = AGENT_REGISTRY[invocation.agentId];
    const systemPrompt = agentSpec ? agentSpec.systemPrompt : 'You are an autonomous engineering agent.';
    let accumulatedOutput = '';

    const execution: AgentExecution = {
      invocationId: invocation.invocationId,
      status: 'RUNNING'
    };
    this.executionStates.set(invocation.invocationId, execution);
    this.eventQueues.set(invocation.invocationId, []);
    this.activeInvocations.set(invocation.invocationId, invocation);

    // Strictly invocation-scoped toolInterceptor bound to invocation.invocationId (§51, §52)
    const toolInterceptor = async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
      const allowed = this.authorizeToolCall(toolName, args, invocation.invocationId);
      if (!allowed) {
        this.emitEvent(invocation.invocationId, {
          invocationId: invocation.invocationId,
          type: 'FAILED',
          payload: { error: `Capability violation: Agent ${invocation.agentId} denied for tool '${toolName}'` },
          timestamp: new Date().toISOString()
        });
        return false;
      }
      return true;
    };

    if (this.sessionFactory) {
      const session = await this.sessionFactory({
        cwd: this.workspaceRoot,
        systemPrompt,
        invocationId: invocation.invocationId,
        onTextDelta: (delta: string) => {
          accumulatedOutput += delta;
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

      const lastText = typeof session.getLastAssistantText === 'function' ? session.getLastAssistantText() : '';
      const finalOutput = lastText || accumulatedOutput;

      if (!finalOutput) {
        execution.status = 'FAILED';
        execution.rawOutput = `Agent ${invocation.agentId} completed execution without producing output`;
      } else {
        execution.status = 'COMPLETED';
        execution.rawOutput = finalOutput;
      }
    } else {
      try {
        const piModule: any = await import('@earendil-works/pi-coding-agent');
        if (typeof piModule.createAgentSession === 'function') {
          let resourceLoader: any = undefined;
          if (typeof piModule.DefaultResourceLoader === 'function') {
            resourceLoader = new piModule.DefaultResourceLoader({
              cwd: this.workspaceRoot,
              extensionFactories: [
                (pi: any) => {
                  pi.on('tool_call', async (event: any) => {
                    const allowed = await toolInterceptor(event.toolName, event.args);
                    if (!allowed) {
                      throw new Error(`[PiRunner Sandboxing]: Action denied for Agent ${invocation.agentId}`);
                    }
                  });
                }
              ]
            });
            if (typeof resourceLoader.reload === 'function') {
              await resourceLoader.reload();
            }
          }

          const { session } = await piModule.createAgentSession({
            cwd: this.workspaceRoot,
            systemPrompt,
            resourceLoader
          });
          this.activeSessions.set(invocation.invocationId, session);

          if (typeof session.subscribe === 'function') {
            session.subscribe((event: any) => {
              if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
                const delta = event.assistantMessageEvent.delta;
                accumulatedOutput += delta;
                this.emitEvent(invocation.invocationId, {
                  invocationId: invocation.invocationId,
                  type: 'TEXT_DELTA',
                  payload: { delta },
                  timestamp: new Date().toISOString()
                });
              }
            });
          }

          await session.prompt(invocation.prompt);

          const lastText = typeof session.getLastAssistantText === 'function' ? session.getLastAssistantText() : '';
          const finalOutput = lastText || accumulatedOutput;

          if (!finalOutput) {
            execution.status = 'FAILED';
            execution.rawOutput = 'Pi session completed without capturing model output';
          } else {
            execution.status = 'COMPLETED';
            execution.rawOutput = finalOutput;
          }
        }
      } catch (err: any) {
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
    if (session) await session.prompt(message.content);
  }

  public async cancel(invocationId: string): Promise<void> {
    const session = this.activeSessions.get(invocationId);
    if (session) await session.abort();
    const exec = this.executionStates.get(invocationId);
    if (exec) exec.status = 'CANCELLED';
  }

  public async *observe(invocationId: string): AsyncIterable<AgentEvent> {
    const queue = this.eventQueues.get(invocationId) || [];
    for (const evt of queue) yield evt;
  }

  public async close(invocationId: string): Promise<void> {
    const session = this.activeSessions.get(invocationId);
    if (session) {
      await session.dispose();
      this.activeSessions.delete(invocationId);
    }
    this.executionStates.delete(invocationId);
    this.eventQueues.delete(invocationId);
    this.activeInvocations.delete(invocationId);
  }

  private emitEvent(invocationId: string, event: AgentEvent): void {
    const queue = this.eventQueues.get(invocationId);
    if (queue) queue.push(event);
  }
}
