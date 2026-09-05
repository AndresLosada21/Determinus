/**
 * Determinus agent definition (ST-02).
 *
 * Single source of truth for the `determinus` orchestrator identity used by:
 * - `.opencode/agents/determinus.md` (static manifest, v2 frontmatter)
 * - `hooks/session-context.ts` (runtime re-append, override-resistant)
 *
 * v2 notes:
 * - Frontmatter `tools:` is legacy and filtered by the host; scoping is via
 *   `permissions: Permission.Ruleset` only.
 * - `ctx.agent.transform(update("determinus"))` upserts from the host default,
 *   so registration is safe whether or not a project overrides the manifest.
 */

export const DETERMINUS_AGENT_ID = "determinus" as const;

export const DETERMINUS_DIRECTIVE = [
  "[Determinus] Durable, evidence-based changes. Tools are the source of truth; do not emulate with shell files.",
  "Sequence: proposal → discovery → design → planning → execution → acceptance → release → archive. Resume the first incomplete gate.",
  "Gate discipline: planning needs approval; execution checkpoints only after scoped verification in the correct worktree; archive only with required sign-off.",
  "Cost discipline: durable state replaces replay; report result/path/command/status/next action, never raw logs or diffs.",
].join("\n");

export function buildDeterminusDirective(): string {
  return DETERMINUS_DIRECTIVE;
}

/**
 * v2 SystemPart shape (`{ type: "text", text }`). The session context
 * `system` array carries structs, never raw strings — pushing a string
 * fails host-side schema validation and breaks the session drain.
 */
export interface SystemTextEntry {
  type: string;
  text: string;
  [key: string]: unknown;
}

export function makeSystemEntry(text: string): SystemTextEntry {
  return { type: "text", text };
}

function entryText(part: unknown): string | null {
  if (typeof part === "string") return part;
  if (
    part !== null &&
    typeof part === "object" &&
    typeof (part as { text?: unknown }).text === "string"
  ) {
    return (part as { text: string }).text;
  }
  return null;
}

export function hasDirectiveEntry(
  system: readonly unknown[],
  directive: string = DETERMINUS_DIRECTIVE,
): boolean {
  const marker = directive.slice(0, 48);
  return system.some((part) => {
    const text = entryText(part);
    return text !== null && (text === directive || text.includes(marker));
  });
}

/**
 * Idempotent struct-aware append. Returns true when an entry was added.
 * Never throws; refuses non-array targets.
 */
export function appendSystemText(system: unknown, text: string): boolean {
  if (!Array.isArray(system)) return false;
  const exists = system.some((part) => entryText(part) === text);
  if (exists) return false;
  system.push(makeSystemEntry(text));
  return true;
}

export function shouldInjectDirective(agentID: unknown): boolean {
  return agentID === DETERMINUS_AGENT_ID;
}

/**
 * Idempotent append: override-resistant re-assertion that never duplicates.
 * Struct-aware: v2 system arrays carry `{ type: "text", text }` entries.
 */
export function injectDirective(
  system: readonly unknown[],
  directive: string = DETERMINUS_DIRECTIVE,
): unknown[] {
  if (hasDirectiveEntry(system, directive)) return [...system];
  return [...system, makeSystemEntry(directive)];
}

/**
 * Register the determinus agent identity on a v2 host (`any`-typed to avoid
 * coupling to a specific `@opencode-ai/plugin` version, same pattern as
 * cache-runtime.ts). Never throws: boot must survive a missing/incompatible
 * agent domain (ST-01 fail-soft).
 */
export async function registerDeterminusAgent(
  ctx: any,
): Promise<() => Promise<void>> {
  try {
    await ctx?.agent?.transform?.((editor: any) => {
      try {
        editor?.update?.(DETERMINUS_AGENT_ID, (agent: any) => {
          try {
            agent.mode = "primary";
            if (!agent.description)
              agent.description =
                "Determinus orchestrator for durable, evidence-based changes.";
            if (!agent.system || typeof agent.system !== "string")
              agent.system = DETERMINUS_DIRECTIVE;
            else if (!agent.system.includes(DETERMINUS_DIRECTIVE.slice(0, 48)))
              agent.system = `${agent.system}\n\n${DETERMINUS_DIRECTIVE}`;
          } catch {
            // Per-agent mutation must never break the transform.
          }
        });
      } catch {
        // Editor failure must never break boot.
      }
    });
  } catch {
    // Missing agent domain (older host) is tolerated.
  }
  return async () => {};
}
