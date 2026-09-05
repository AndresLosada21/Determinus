/**
 * Determinus session-context enforcement (ST-02 base).
 *
 * Re-appends the SDD/TDD directive on every `session.context` for agent
 * `determinus`, so a project-level manifest override cannot silently drop it
 * (last-transform-wins). Kind-aware: applies to `primary` and `compaction`
 * (compaction reuses `agent.info`; directive must survive it). Other agents
 * and kinds (`title`, `generate`) are left untouched.
 *
 * Defensive: never throws, never blocks boot.
 */

import {
  DETERMINUS_AGENT_ID,
  DETERMINUS_DIRECTIVE,
  appendSystemText,
  hasDirectiveEntry,
  shouldInjectDirective,
} from "../agent-definition";

function getAgentID(event: any): unknown {
  return event?.agent ?? event?.agentID ?? event?.agentId;
}

function getKind(event: any): unknown {
  return event?.kind;
}

function appendDirective(event: any): void {
  const system = (event as any)?.system;
  if (!Array.isArray(system)) return;
  if (hasDirectiveEntry(system, DETERMINUS_DIRECTIVE)) return;
  appendSystemText(system, DETERMINUS_DIRECTIVE);
}

export function shouldEnforceForEvent(event: any): boolean {
  if (!shouldInjectDirective(getAgentID(event))) return false;
  const kind = getKind(event);
  if (kind === undefined || kind === null) return true;
  return kind === "primary" || kind === "compaction";
}

export function enforceSessionContext(event: any): void {
  if (!shouldEnforceForEvent(event)) return;
  try {
    appendDirective(event);
  } catch {
    // Enforcement must never throw inside a host hook.
  }
}

export async function registerDeterminusSessionContext(
  ctx: any,
): Promise<() => Promise<void>> {
  try {
    const registration = await ctx?.session?.hook?.("context", (event: any) => {
      enforceSessionContext(event);
    });
    void registration;
  } catch {
    // Missing session domain (older host) is tolerated.
  }
  return async () => {};
}

export { DETERMINUS_AGENT_ID };
