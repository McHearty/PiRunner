declare module '@earendil-works/pi-coding-agent' {
  export interface CreateAgentSessionOptions {
    cwd: string;
    systemPrompt: string;
    [key: string]: unknown;
  }

  export function createAgentSession(options: CreateAgentSessionOptions): Promise<{
    session: {
      prompt(text: string, options?: { streamingBehavior?: 'steer' | 'followUp' }): Promise<void>;
      abort(): Promise<void>;
      dispose(): Promise<void>;
      subscribe?: (callback: (event: any) => void) => void;
      getLastAssistantText?: () => string;
    };
  }>;
}
