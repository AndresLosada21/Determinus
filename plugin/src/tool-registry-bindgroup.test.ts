import { describe, expect, test } from "vitest";
import { EXPLICITLY_BOUND, PUBLIC_TOOL_ENTRIES } from "./tool-registry";

const EXPECTED_EXPLICITLY_BOUND = [
  "determinus_spec",
  "determinus_wip_state",
  "determinus_change_archive",
  "determinus_task_cancel",
  "determinus_gate_complete",
  "determinus_run_test",
  "determinus_task_checkpoint",
  "determinus_worktree_create",
  "determinus_worktree_delete",
  "determinus_worktree_cleanup",
  "determinus_worktree_triage",
  "determinus_tool_invoke",
] as const;

describe("tool-registry bindGroup exclusions", () => {
  test("EXPLICITLY_BOUND contains exactly the non-default bindings", () => {
    expect([...EXPLICITLY_BOUND].sort()).toEqual(
      [...EXPECTED_EXPLICITLY_BOUND].sort(),
    );
  });

  test("every explicitly bound tool exists in the public inventory", () => {
    const publicNames = new Set(PUBLIC_TOOL_ENTRIES.map((entry) => entry.name));

    for (const name of EXPLICITLY_BOUND) {
      expect(
        publicNames.has(name),
        `${name} is not in PUBLIC_TOOL_ENTRIES`,
      ).toBe(true);
    }
  });
});
