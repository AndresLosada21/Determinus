import { Plugin } from '@opencode-ai/plugin';

interface GitSessionContext {
    isWorktree: boolean;
    isMainCheckout: boolean;
    mainCheckoutPath?: string;
    currentCheckoutPath?: string;
}
declare function resolveGitSessionContext(directory: string, worktree: string | undefined): GitSessionContext;

/**
 * Determinus Plugin (ST-01: SDK v2 host).
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Host surface is v2-only (see default export below):
 * - ctx.tool.transform / ctx.tool.hook("execute.before"/"execute.after")
 * - ctx.event.subscribe (+ installCacheRuntime)
 * Legacy `advancePluginImpl` below is an internal adapter preserving the
 * pre-v2 tool/event behavior for tests; its `determinus.system.turn` and
 * `determinus.compaction.turn` entries are served on the v2 host through
 * `ctx.session.hook("context")` (see the setup wrapper), never as legacy
 * host hooks.
 */

/**
 * Persist oversized fallback content to the durable sink before the consumer
 * transform replaces it in the prompt (AC3). Idempotent by content hash â€”
 * repeated prompt builds for the same content do not re-write. Returns the
 * persisted file path, or null on write failure (caller falls back to an
 * honest full-drop marker with no path).
 */
declare const persistFallbackContent: (content: string, dir?: string) => string | null;
/**
 * Honest persisted-result marker (AC4). Names the source, the total chars,
 * the number elided, the durable path, and a small preview â€” never a
 * head-and-tail excerpt.
 */
declare const fallbackPersistedMarker: (source: string, content: string, filePath: string) => string;
declare const compactToolPart: (part: unknown) => boolean;
/**
 * OpenCode 2 message shape is `{ role, content }`, not the v1
 * `{ info, parts }` shape used by the original ADV hook.  The compatibility
 * adapter used to shallow-cast v2 messages, silently making output compaction
 * a no-op.  Compact the native ToolResultPart in place as well.
 */
declare const compactV2ToolResultPart: (_part: unknown) => boolean;
declare const compactPromptMessages: (_messages: Array<any>) => {
    droppedBlank: number;
    compactedToolOutputs: number;
    compactedDiffs: number;
};
declare const enforcePromptHistoryBudget: (messages: Array<any>) => {
    omittedMessages: number;
    compactedTextParts: number;
    retainedChars: any;
    limit: null;
};
declare const AdvancePlugin: Plugin;
declare const _default: any;

export { AdvancePlugin, compactPromptMessages, compactToolPart, compactV2ToolResultPart, _default as default, enforcePromptHistoryBudget, fallbackPersistedMarker, persistFallbackContent, resolveGitSessionContext };
