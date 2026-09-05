interface GitSessionContext {
    isWorktree: boolean;
    isMainCheckout: boolean;
    mainCheckoutPath?: string;
    currentCheckoutPath?: string;
}
declare function resolveGitSessionContext(directory: string, worktree: string | undefined): GitSessionContext;

/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Implements the @opencode-ai/plugin SDK interface with:
 * - tool: MCP tools for spec/change/task/wisdom/test management (see tool-registry.ts)
 * - event: Session status tracking, terminal UI updates
 * - tool.execute.before/after: Active change tracking, task completion detection
 * - experimental.session.compacting: Change preservation during compaction
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
declare const _default: any;

export { compactPromptMessages, compactToolPart, compactV2ToolResultPart, _default as default, enforcePromptHistoryBudget, fallbackPersistedMarker, persistFallbackContent, resolveGitSessionContext };
