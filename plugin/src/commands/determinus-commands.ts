/**
 * Determinus SDD commands as code (ST-03).
 *
 * The 3.0.4 baseline ships no `.opencode/command/*.md` files, so slash
 * commands must be registered at runtime via `ctx.command.transform`.
 * Each command is a thin prompt-template over COMMAND_MANIFEST: it steers
 * the session toward the phase goal and gate using the `determinus_*`
 * tools. The tools do the work; the command only routes.
 *
 * Subset: the 9 gate-carrying SDD commands. The rest of COMMAND_MANIFEST
 * stays advisory metadata until a later story needs it.
 *
 * `any`-typed host (same pattern as cache-runtime.ts / agent-definition.ts):
 * never couple to a specific `@opencode-ai/plugin` version. Fail-soft.
 */

import { COMMAND_MANIFEST, type CommandDef } from "../manifest";

export const SDD_COMMAND_NAMES = [
  "determinus-proposal",
  "determinus-discover",
  "determinus-design",
  "determinus-prep",
  "determinus-apply",
  "determinus-review",
  "determinus-harden",
  "determinus-validate",
  "determinus-archive",
] as const;

export type SddCommandName = (typeof SDD_COMMAND_NAMES)[number];

export function getSddCommandDefs(): CommandDef[] {
  return SDD_COMMAND_NAMES.map((name) => COMMAND_MANIFEST[name]).filter(
    (def): def is CommandDef => def !== undefined,
  );
}

/**
 * Deterministic prompt for a command invocation. Pure: same def + args
 * always yields the same text (stable for tests and cache).
 */
export function buildCommandPrompt(def: CommandDef, argsText: string): string {
  const lines: string[] = [`[Determinus /${def.name}] ${def.description}`];
  if (def.phaseGoal) lines.push(`Phase goal: ${def.phaseGoal}`);
  if (def.gate) lines.push(`Gate: ${def.gate}`);
  const gates = def.scope?.gates;
  if (gates && gates.length > 0) lines.push(`Owns gates: ${gates.join(", ")}`);
  if (def.requiresChangeId)
    lines.push(`Arguments: ${argsText || def.args_hint || "<change-id>"}`);
  else if (argsText) lines.push(`Arguments: ${argsText}`);
  lines.push(
    "Use the determinus_* tools as the source of truth for changes, gates, tasks and evidence. Do not emulate with shell files.",
  );
  return lines.join("\n");
}

function extractArgsText(prompt: unknown): string {
  if (typeof prompt === "string") return prompt.trim();
  if (prompt && typeof prompt === "object") {
    const record = prompt as Record<string, unknown>;
    for (const key of ["text", "prompt", "args", "input"]) {
      if (typeof record[key] === "string")
        return (record[key] as string).trim();
    }
  }
  return "";
}

/**
 * Execute a slash command by prompting the session. Never throws: a
 * command failure must surface as session text, not a host crash.
 */
export async function executeSddCommand(
  def: CommandDef,
  input: any,
  host: any,
): Promise<void> {
  try {
    const text = buildCommandPrompt(def, extractArgsText(input?.prompt));
    const sessionID = input?.sessionID;
    const promptFn = host?.session?.prompt;
    if (typeof promptFn === "function" && sessionID) {
      await promptFn.call(host.session, { sessionID, text });
      return;
    }
    // No session channel (older host / test double): nothing to route to.
  } catch {
    // Swallow: command routing must never crash the host.
  }
}

export interface HostCommandDefinition {
  name: string;
  description?: string;
  execute: (input: any) => Promise<void>;
}

export function buildHostCommandDefs(host: any): HostCommandDefinition[] {
  return getSddCommandDefs().map((def) => ({
    name: def.name,
    description: def.description,
    execute: (input: any) => executeSddCommand(def, input, host),
  }));
}

export async function registerDeterminusCommands(
  ctx: any,
): Promise<() => Promise<void>> {
  try {
    await ctx?.command?.transform?.((editor: any) => {
      try {
        for (const def of buildHostCommandDefs(ctx)) {
          try {
            editor?.add?.(def);
          } catch {
            // Per-command failure must never block the rest.
          }
        }
      } catch {
        // Editor failure must never break boot.
      }
    });
  } catch {
    // Missing command domain (older host) is tolerated.
  }
  return async () => {};
}
