/**
 * Shim for @opencode-ai/plugin v2
 * Provides type declarations for both legacy (function) and new (define) APIs
 * so that the codebase can be migrated incrementally and still typecheck.
 */

declare module "@opencode-ai/plugin" {
  // Legacy v1 Plugin type (function)
  export type Plugin = (input: PluginInput) => Promise<Hooks>;
  export interface PluginInput {
    directory: string;
    worktree: string;
    project: {
      id: string;
      worktree: string;
      vcsDir?: string;
      vcs?: string;
      time: { created: number; initialized?: number };
    };
    client: any;
    serverUrl: URL;
    experimental_workspace?: {
      register?: (name: string, adapter: any) => void;
    };
    $?: unknown;
  }
  export interface ToolDefinition {
    description: string;
    args: Record<string, any>;
    execute: (args: unknown, context: unknown) => Promise<any>;
  }
  export type ToolResult =
    | string
    | { title?: string; output: string; metadata?: Record<string, unknown> };
  export interface ToolContext {
    sessionID: string;
    messageID: string;
    agent: string;
    directory?: string;
    worktree?: string;
    abort: AbortSignal;
    metadata: (input: {
      title?: string;
      metadata?: Record<string, unknown>;
    }) => void;
    progress?: (update: Record<string, unknown>) => Promise<void>;
    ask?: () => Promise<void>;
  }
  export interface Hooks {
    tool?: Record<string, ToolDefinition>;
    event?: (input: { event: unknown }) => Promise<void>;
    "tool.execute.before"?: (input: unknown, output: unknown) => Promise<void>;
    "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>;
    "experimental.chat.system.transform"?: (
      input: any,
      output: any,
    ) => Promise<void>;
    "experimental.chat.messages.transform"?: (
      input: any,
      output: any,
    ) => Promise<void>;
    "experimental.session.compacting"?: (
      input: unknown,
      output: unknown,
    ) => Promise<void>;
  }
  export function tool(def: {
    description: string;
    args: Record<string, any>;
    execute: (args: any, ctx: ToolContext) => Promise<ToolResult>;
  }): ToolDefinition;

  // New v2 Plugin.define API
  export namespace Plugin {
    function define(plugin: {
      id: string;
      setup: (ctx: any) => Promise<any> | any;
      vcs?: any;
    }): any;
  }
  export const Plugin: {
    define: (plugin: {
      id: string;
      setup: (ctx: any) => Promise<any> | any;
      vcs?: any;
    }) => any;
  };

  // Additional exports for workspace adapter (legacy)
  export type WorkspaceAdapter = any;
  export type WorkspaceInfo = any;
}

// Also declare subpath imports
declare module "@opencode-ai/plugin/effect" {
  export const Plugin: any;
}
declare module "@opencode-ai/plugin/promise" {
  export const Plugin: any;
}
