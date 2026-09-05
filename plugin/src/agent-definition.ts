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

export function shouldInjectDirective(agentID: unknown): boolean {
  return agentID === DETERMINUS_AGENT_ID;
}

/**
 * Idempotent append: override-resistant re-assertion that never duplicates.
 * `system` is treated opaquely (string entries); non-string parts are left
 * untouched and the directive is appended when absent.
 */
export function injectDirective(
  system: readonly unknown[],
  directive: string = DETERMINUS_DIRECTIVE,
): unknown[] {
  const contains = system.some(
    (part) =>
      typeof part === "string" &&
      (part === directive || part.includes(directive.slice(0, 48))),
  );
  if (contains) return [...system];
  return [...system, directive];
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
