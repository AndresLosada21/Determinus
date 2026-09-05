import { describe, expect, test } from "vitest";
import { checkTddOrdering } from "./tdd-ordering";

function red(id: string) {
  return {
    runId: id,
    phase: "red",
    exitCode: 1,
    classification: "failed",
    failure_class: "assertion_failure",
    failure_signal: "expected 401 but received 200",
    test_fingerprint: "fp-abc",
  };
}

function green(id: string, fingerprint = "fp-abc") {
  return {
    runId: id,
    phase: "green",
    exitCode: 0,
    classification: "passed",
    test_fingerprint: fingerprint,
  };
}

describe("tdd oracle + fingerprint (ST-08)", () => {
  test("oracle match passes", () => {
    const r = checkTddOrdering({
      taskId: "tk-p1",
      runs: [red("tr_r"), green("tr_g")],
      oracle: {
        allowed_failure_class: "assertion_failure",
        expected_signal: "expected 401",
      },
    });
    expect(r.ok).toBe(true);
  });

  test("infra failure does not satisfy oracle", () => {
    const r = checkTddOrdering({
      taskId: "tk-p1",
      runs: [
        {
          runId: "tr_r",
          phase: "red",
          exitCode: 1,
          classification: "failed",
          failure_class: "module_not_found",
          failure_signal: "Cannot find module",
          test_fingerprint: "fp-abc",
        },
        green("tr_g"),
      ],
      oracle: {
        allowed_failure_class: "assertion_failure",
        expected_signal: "expected 401",
      },
    });
    expect(r.ok).toBe(false);
  });

  test("fingerprint divergence invalidates RED", () => {
    const r = checkTddOrdering({
      taskId: "tk-p1",
      runs: [red("tr_r"), green("tr_g", "fp-weakened")],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/STALE|fingerprint/i);
  });
});
