declare module '@earendil-works/pi-coding-agent' {
  export interface ExtensionUI {
    notify(message: string, type?: 'info' | 'warning' | 'error'): void;
    confirm(title: string, message: string): Promise<boolean>;
    select(title: string, message: string, options: { id: string; label: string; detail?: string }[]): Promise<string>;
  }

  export interface ExtensionContext {
    ui: ExtensionUI;
  }

  export interface ExtensionCommand {
    description: string;
    handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  }

  export interface ExtensionAPI {
    registerCommand(name: string, command: ExtensionCommand): void;
    on(event: 'tool_call', handler: (call: { toolName: string; args: Record<string, unknown> }) => Promise<boolean | void>): void;
  }
}
