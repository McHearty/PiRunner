declare module '@earendil-works/pi-coding-agent' {
  export interface CreateAgentSessionOptions {
    cwd: string;
    systemPrompt: string;
    [key: string]: unknown;
  }

  export function createAgentSession(options: CreateAgentSessionOptions): Promise<{
    session: {
      prompt(text: string): Promise<void>;
      abort(): Promise<void>;
      dispose(): Promise<void>;
    };
  }>;
}
