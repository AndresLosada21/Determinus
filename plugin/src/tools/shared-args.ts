import { z } from "zod";

/**
 * Shared Zod schema for the `include.snapshot` opt-in arg.
 *
 * Mirrors `determinus_change_show`'s existing `include.snapshot` field shape
 * (change.ts:970-975). Spread into tool arg blocks via
 * `...includeSnapshotSchema.shape` — same pattern as `targetPathSchema`.
 *
 * Used by the 8 tools that invert `_contextSnapshot` emission from auto-emit
 * to opt-in: `determinus_task_ready`, `determinus_task_update` (in_progress/done),
 * `determinus_task_add`, `determinus_task_cancel`, `determinus_change_create`,
 * `determinus_change_reenter`, `determinus_wisdom_add`, `determinus_gate_complete`.
 *
 * `determinus_change_show` KEEPS its broader `include` object (snapshot, ledger,
 * readyTasks, etc.) — this shared schema is for the 8 inverted tools only.
 */
export const includeSnapshotSchema = z.object({
  include: z
    .object({
      snapshot: z
        .boolean()
        .optional()
        .describe(
          "When true, attaches the rendered context snapshot as top-level `_contextSnapshot`.",
        ),
    })
    .optional()
    .describe("Optional include flags for extra fields."),
});
