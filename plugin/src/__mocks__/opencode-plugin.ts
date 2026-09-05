/**
 * Mock for @opencode-ai/plugin
 *
 * Provides minimal mocks for testing without requiring the full SDK.
 */

import { z } from "zod";

// Type definitions
export type Plugin = (input: PluginInput) => Promise<Hooks>;

export interface PluginInput {
  client: unknown;
  project: {
    id: string;
    worktree: string;
    vcsDir?: string;
    vcs?: "git";
    time: { created: number; initialized?: number };
  };
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: unknown;
}

export interface ToolDefinition {
  description: string;
  args: Record<string, z.ZodType>;
  execute: (args: unknown, context: unknown) => Promise<ToolResult>;
}

export type ToolResult =
  | string
  | {
      title?: string;
      output: string;
      metadata?: { [key: string]: unknown };
      attachments?: unknown[];
    };

export interface Hooks {
  tool?: Record<string, ToolDefinition>;
  event?: (input: { event: unknown }) => Promise<void>;
  "tool.execute.before"?: (input: unknown, output: unknown) => Promise<void>;
  "tool.execute.after"?: (input: unknown, output: unknown) => Promise<void>;
  "determinus.system.turn"?: (
    input: { sessionID: string },
    output: { system: string[] },
  ) => Promise<void>;
  "determinus.compaction.turn"?: (
    input: unknown,
    output: unknown,
  ) => Promise<void>;
}

export interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  directory?: string;
  worktree?: string;
  abort: AbortSignal;
  metadata: (input: {
    title?: string;
    metadata?: { [key: string]: unknown };
  }) => void;
  ask: () => Promise<void>;
}

// Tool helper function
export const tool = <TArgs extends Record<string, z.ZodType>>(definition: {
  description: string;
  args: TArgs;
  execute: (
    args: z.infer<z.ZodObject<TArgs>>,
    context: ToolContext,
  ) => Promise<ToolResult>;
}): ToolDefinition => {
  return {
    description: definition.description,
    args: definition.args,
    execute: definition.execute as (
      args: unknown,
      context: unknown,
    ) => Promise<ToolResult>,
  };
};

// Schema helpers attached to tool
tool.schema = {
  string: () => z.string(),
  number: () => z.number(),
  boolean: () => z.boolean(),
  literal: <T extends string | number | bigint | boolean | null | undefined>(
    value: T,
  ) => z.literal(value),
  array: <T extends z.ZodType>(schema: T) => z.array(schema),
  enum: <T extends [string, ...string[]]>(values: T) => z.enum(values),
  object: <T extends z.ZodRawShape>(shape: T) => z.object(shape),
  record: <V extends z.ZodType>(key: z.ZodString, value: V) =>
    z.record(key, value),
};

// Plugin.define for v2 (promise/effect) compatibility
export const Plugin = {
  define: (plugin: {
    id: string;
    setup: (ctx: unknown) => unknown;
    vcs?: unknown;
  }) => plugin,
};

// Named export for `import { Plugin } from "@opencode-ai/plugin"` (used in v2)
export { Plugin as default };

// Re-export types
export type { z };
