/**
 * Determinus SDD/TDD skills as code (ST-05).
 *
 * The 3.0.4 baseline ships no `skills/` directory, so guidance is registered
 * at runtime via `ctx.skill.transform`. Skills keep the agent system prompt
 * lean: SDD/TDD guidance loads on demand instead of polluting every turn.
 *
 * - `determinus-sdd`: change-plane and gate discipline (autoinvoke: offered
 *   by default through skill guidance).
 * - `determinus-tdd`: red→green→verify evidence discipline (on demand).
 *
 * `any`-typed host (same pattern as agent/commands registration): never
 * couple to a specific `@opencode-ai/plugin` version. Fail-soft.
 */

export interface DeterminusSkillDefinition {
  id: string;
  name: string;
  description: string;
  slash: boolean;
  autoinvoke: boolean;
  content: string;
}

export const DETERMINUS_SDD_SKILL: DeterminusSkillDefinition = {
  id: "determinus-sdd",
  name: "determinus-sdd",
  description:
    "SDD change-plane guidance: proposal → discovery → design → planning → execution → acceptance → release → archive with tools as source of truth.",
  slash: false,
  autoinvoke: true,
  content: [
    "# Determinus SDD",
    "",
    "Durable, evidence-based changes. The determinus_* tools are the source of",
    "truth for changes, gates, tasks and evidence — never emulate them with",
    "shell files or manual archive folders.",
    "",
    "## Gate order (strict)",
    "",
    "proposal → discovery → design → planning → execution → acceptance → release → archive.",
    "Resume the first incomplete gate. Planning needs explicit user approval.",
    "Execution checkpoints only after scoped verification in the correct worktree.",
    "Archive only with required sign-off.",
    "",
    "## Cost discipline",
    "",
    "Durable state replaces chat replay. Report result, path, command, status",
    "and next action — never raw logs, trees, diffs or full test reports.",
  ].join("\n"),
};

export const DETERMINUS_TDD_SKILL: DeterminusSkillDefinition = {
  id: "determinus-tdd",
  name: "determinus-tdd",
  description:
    "TDD evidence discipline: red→green→verify pairing for task completion via determinus_run_test and determinus_task_checkpoint.",
  slash: false,
  autoinvoke: false,
  content: [
    "# Determinus TDD",
    "",
    "Every code task completes with a red→green pair recorded by",
    "determinus_run_test (phase red expecting failure, then phase green",
    "expecting pass). Pass lastRedRunId/lastGreenRunId to disambiguate when",
    "several runs exist.",
    "",
    "Complete tasks only through determinus_task_checkpoint (mode complete),",
    "never via task_update status done. Cross-cutting verification uses",
    "tdd_intent separate_verification with an explicit lastEvidenceRunId.",
    "Reclassify tdd_intent to not_applicable (with user approval) when TDD",
    "truly does not apply.",
    "",
    "Declare the red oracle in task metadata when the Scenario's expected",
    "failure is known before the run (from /determinus-prep):",
    "metadata.red_oracle_class (e.g. assertion_failure) and",
    "metadata.red_oracle_signal (expected substring, e.g. expected 401).",
    "Checkpoint enforces RED_AMBIGUOUS unless RED matches; absent keys keep",
    "legacy pass-through. A spec bump after GREEN turns evidence STALE until",
    "re-proven — re-run red→green against current documents.",
  ].join("\n"),
};

export function getDeterminusSkillDefs(): DeterminusSkillDefinition[] {
  return [DETERMINUS_SDD_SKILL, DETERMINUS_TDD_SKILL];
}

export async function registerDeterminusSkills(
  ctx: any,
): Promise<() => Promise<void>> {
  try {
    await ctx?.skill?.transform?.((editor: any) => {
      try {
        for (const skill of getDeterminusSkillDefs()) {
          try {
            editor?.add?.({ ...skill });
          } catch {
            // Per-skill failure must never block the rest.
          }
        }
      } catch {
        // Editor failure must never break boot.
      }
    });
  } catch {
    // Missing skill domain (older host) is tolerated.
  }
  return async () => {};
}
