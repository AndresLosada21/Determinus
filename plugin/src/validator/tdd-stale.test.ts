import { describe, expect, test } from "vitest";
import { checkTddOrdering } from "./tdd-ordering";

function runWithRev(id: string, classification: string, spec_revision: string) {
  return {
    runId: id,
    phase: classification === "passed" ? "green" : "red",
    exitCode: classification === "passed" ? 0 : 1,
    classification,
    failure_class: "assertion_failure",
    failure_signal: "expected 401 but received 200",
    test_fingerprint: "fp-abc",
    spec_revision,
  };
}

describe("tdd stale invalidation (ST-09)", () => {
  test("same revision pair passes", () => {
    const r = checkTddOrdering({
      taskId: "tk-p2",
      runs: [runWithRev("tr_r", "failed", "spec-7"), runWithRev("tr_g", "passed", "spec-7")],
      current_spec_revision: "spec-7",
    });
    expect(r.ok).toBe(true);
  });

  test("bump to spec-8 makes spec-7 evidence STALE", () => {
    const r = checkTddOrdering({
      taskId: "tk-p2",
      runs: [runWithRev("tr_r", "failed", "spec-7"), runWithRev("tr_g", "passed", "spec-7")],
      current_spec_revision: "spec-8",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/STALE/i);
  });
});
