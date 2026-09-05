import { describe, expect, test } from "vitest";
import {
  checkExecutionPairing,
  checkTddOrdering,
  resolveTddIntent,
  type TddTestRunLike,
} from "./tdd-ordering";

function run(
  runId: string,
  classification: string,
  index: number,
): TddTestRunLike {
  return {
    runId,
    phase: classification === "passed" ? "green" : "red",
    exitCode: classification === "passed" ? 0 : 1,
    classification,
    command: `vitest run file-${index}.test.ts`,
    durationMs: 100,
    recordedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  };
}

const RED = (id: string, i: number) => run(id, "failed", i);
const RED_TIMEOUT = (id: string, i: number) => run(id, "timed_out", i);
const GREEN = (id: string, i: number) => run(id, "passed", i);

describe("tdd-ordering intent resolution", () => {
  test("missing and unknown intents default to inline", () => {
    expect(resolveTddIntent(undefined)).toBe("inline");
    expect(resolveTddIntent("")).toBe("inline");
    expect(resolveTddIntent("whatever")).toBe("inline");
    expect(resolveTddIntent("separate_verification")).toBe(
      "separate_verification",
    );
    expect(resolveTddIntent("not_applicable")).toBe("not_applicable");
  });
});

describe("tdd-ordering inline", () => {
  test("no runs blocks with TASK_ORDERING_VIOLATION", () => {
    const result = checkTddOrdering({ taskId: "tk-1", runs: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TASK_ORDERING_VIOLATION");
      expect(result.message).toContain("tk-1");
      expect(result.remediation).toContain("determinus_run_test");
    }
  });

  test("only passed runs block (no red)", () => {
    const result = checkTddOrdering({
      taskId: "tk-1",
      runs: [GREEN("tr_g", 0)],
    });
    expect(result.ok).toBe(false);
  });

  test("only failed runs block (no green)", () => {
    const result = checkTddOrdering({
      taskId: "tk-1",
      runs: [RED("tr_r", 0)],
    });
    expect(result.ok).toBe(false);
  });

  test("failed-then-passed passes with the detected pair", () => {
    const result = checkTddOrdering({
      taskId: "tk-1",
      runs: [RED("tr_r", 0), GREEN("tr_g", 1)],
    });
    expect(result).toEqual({
      ok: true,
      pair: { redRunId: "tr_r", greenRunId: "tr_g" },
    });
  });

  test("passed-before-failed does not count (wrong order)", () => {
    const result = checkTddOrdering({
      taskId: "tk-1",
      runs: [GREEN("tr_g", 0), RED("tr_r", 1)],
    });
    expect(result.ok).toBe(false);
  });

  test("non-passed classifications count as red (timed_out)", () => {
    const result = checkTddOrdering({
      taskId: "tk-1",
      runs: [RED_TIMEOUT("tr_r", 0), GREEN("tr_g", 1)],
    });
    expect(result.ok).toBe(true);
  });

  test("explicit refs are verified for existence, outcome and order", () => {
    const runs = [RED("tr_r", 0), GREEN("tr_g", 1)];
    const ok = checkTddOrdering({
      taskId: "tk-1",
      runs,
      refs: { lastRedRunId: "tr_r", lastGreenRunId: "tr_g" },
    });
    expect(ok.ok).toBe(true);

    const redPassed = checkTddOrdering({
      taskId: "tk-1",
      runs: [GREEN("tr_a", 0), GREEN("tr_g", 1)],
      refs: { lastRedRunId: "tr_a", lastGreenRunId: "tr_g" },
    });
    expect(redPassed.ok).toBe(false);

    const greenFailed = checkTddOrdering({
      taskId: "tk-1",
      runs: [RED("tr_r", 0), RED("tr_r2", 1)],
      refs: { lastRedRunId: "tr_r", lastGreenRunId: "tr_r2" },
    });
    expect(greenFailed.ok).toBe(false);

    const reversed = checkTddOrdering({
      taskId: "tk-1",
      runs: [GREEN("tr_g", 0), RED("tr_r", 1)],
      refs: { lastRedRunId: "tr_r", lastGreenRunId: "tr_g" },
    });
    expect(reversed.ok).toBe(false);

    const missing = checkTddOrdering({
      taskId: "tk-1",
      runs,
      refs: { lastRedRunId: "tr_nope", lastGreenRunId: "tr_g" },
    });
    expect(missing.ok).toBe(false);

    const partial = checkTddOrdering({
      taskId: "tk-1",
      runs,
      refs: { lastGreenRunId: "tr_g" },
    });
    expect(partial.ok).toBe(false);
  });

  test("advisory warns instead of blocking, off skips", () => {
    const advisory = checkTddOrdering({
      taskId: "tk-1",
      runs: [],
      enforcement: "advisory",
    });
    expect(advisory.ok).toBe(true);
    if (advisory.ok) expect(advisory.advisory).toContain("tk-1");

    expect(
      checkTddOrdering({ taskId: "tk-1", runs: [], enforcement: "off" }),
    ).toEqual({ ok: true });
  });
});

describe("tdd-ordering separate_verification and not_applicable", () => {
  test("separate_verification requires a passed evidence ref", () => {
    expect(
      checkTddOrdering({
        taskId: "tk-1",
        intent: "separate_verification",
        runs: [GREEN("tr_g", 0)],
      }).ok,
    ).toBe(false);

    expect(
      checkTddOrdering({
        taskId: "tk-1",
        intent: "separate_verification",
        runs: [GREEN("tr_g", 0)],
        refs: { lastEvidenceRunId: "tr_missing" },
      }).ok,
    ).toBe(false);

    expect(
      checkTddOrdering({
        taskId: "tk-1",
        intent: "separate_verification",
        runs: [RED("tr_r", 0)],
        refs: { lastEvidenceRunId: "tr_r" },
      }).ok,
    ).toBe(false);

    expect(
      checkTddOrdering({
        taskId: "tk-1",
        intent: "separate_verification",
        runs: [GREEN("tr_g", 0)],
        refs: { lastEvidenceRunId: "tr_g" },
      }),
    ).toEqual({ ok: true });
  });

  test("not_applicable never blocks", () => {
    expect(
      checkTddOrdering({ taskId: "tk-1", intent: "not_applicable", runs: [] }),
    ).toEqual({ ok: true });
  });
});

describe("execution pairing", () => {
  const pair = [RED("tr_r", 0), GREEN("tr_g", 1)];

  test("done inline tasks with pairs pass; without pairs are listed", () => {
    expect(
      checkExecutionPairing({
        tasks: [{ id: "tk-1", status: "done" }],
        testRuns: { "tk-1": pair },
      }),
    ).toEqual({ ok: true, unpaired: [] });

    const blocked = checkExecutionPairing({
      tasks: [
        { id: "tk-1", status: "done" },
        { id: "tk-2", status: "done", metadata: { tdd_intent: "inline" } },
      ],
      testRuns: { "tk-1": pair, "tk-2": [GREEN("tr_g", 0)] },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.unpaired).toEqual(["tk-2"]);
      expect(blocked.message).toContain("tk-2");
    }
  });

  test("cancelled and not_applicable tasks are exempt", () => {
    expect(
      checkExecutionPairing({
        tasks: [
          { id: "tk-1", status: "cancelled" },
          {
            id: "tk-2",
            status: "done",
            metadata: { tdd_intent: "not_applicable" },
          },
          { id: "tk-3", status: "in_progress" },
        ],
        testRuns: {},
      }),
    ).toEqual({ ok: true, unpaired: [] });
  });

  test("separate_verification needs a passed run; off/advisory skip", () => {
    expect(
      checkExecutionPairing({
        tasks: [
          {
            id: "tk-1",
            status: "done",
            metadata: { tdd_intent: "separate_verification" },
          },
        ],
        testRuns: { "tk-1": [GREEN("tr_g", 0)] },
      }),
    ).toEqual({ ok: true, unpaired: [] });

    expect(
      checkExecutionPairing({
        tasks: [
          {
            id: "tk-1",
            status: "done",
            metadata: { tdd_intent: "separate_verification" },
          },
        ],
        testRuns: {},
      }).ok,
    ).toBe(false);

    expect(
      checkExecutionPairing({ tasks: [], testRuns: {}, enforcement: "off" }),
    ).toEqual({ ok: true, unpaired: [] });
    const advisory = checkExecutionPairing({
      tasks: [{ id: "tk-1", status: "done" }],
      testRuns: {},
      enforcement: "advisory",
    });
    expect(advisory.ok).toBe(true);
    expect(advisory.unpaired).toEqual(["tk-1"]);
    expect(advisory.message).toContain("tk-1");
  });
});
