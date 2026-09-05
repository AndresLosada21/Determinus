/**
 * TDD red→green ordering enforcement (ST-04, rq-TDD009seq).
 *
 * Pure module: no IO, no store. Callers (checkpoint complete path,
 * execution-gate completion) supply the task intent, its recorded test runs,
 * and optional evidence refs; this module decides pass / violation.
 *
 * Semantics:
 * - `inline` (default when intent is absent): requires a failed run followed
 *   by a passed run. Explicit refs, when supplied, are verified for
 *   existence, outcome (red must not have passed, green must have passed),
 *   and order (red recorded before green). Without refs the pair is
 *   auto-detected in record order (the ring buffer preserves insertion).
 * - `separate_verification`: cross-cutting evidence cannot be auto-detected;
 *   requires an explicit `lastEvidenceRunId` pointing at a passed run.
 * - `not_applicable`: no evidence required (verification text is handled by
 *   the caller's own required-verification rules).
 * - Enforcement `off` skips; `advisory` completes with a warning instead of
 *   blocking; `strict` (default, per project.json) blocks with
 *   TASK_ORDERING_VIOLATION.
 */

export type TddIntent = "inline" | "separate_verification" | "not_applicable";

export type TddEnforcement = "strict" | "advisory" | "off";

export interface TddTestRunLike {
  runId: string;
  phase?: string;
  /** Null when the runner never produced an exit code (spawn error etc.). */
  exitCode: number | null;
  /** Authoritative outcome; `determinus_run_test` sets "passed" only on pass. */
  classification: string;
}

export interface TddEvidenceRefs {
  lastRedRunId?: string;
  lastGreenRunId?: string;
  lastEvidenceRunId?: string;
}

export interface TddOrderingInput {
  taskId: string;
  /** Raw metadata intent; absent/unknown resolves to "inline". */
  intent?: string;
  runs: readonly TddTestRunLike[];
  refs?: TddEvidenceRefs;
  enforcement?: TddEnforcement;
}

export interface TddOrderingViolation {
  ok: false;
  code: "TASK_ORDERING_VIOLATION";
  taskId: string;
  message: string;
  remediation: string;
}

export interface TddOrderingPass {
  ok: true;
  /** Present only when enforcement is advisory and evidence is missing. */
  advisory?: string;
  /** The pair that satisfied the check (refs or auto-detected). */
  pair?: { redRunId: string; greenRunId: string };
}

export type TddOrderingResult = TddOrderingViolation | TddOrderingPass;

export function resolveTddIntent(rawIntent?: string): TddIntent {
  if (rawIntent === "separate_verification" || rawIntent === "not_applicable") {
    return rawIntent;
  }
  return "inline";
}

function isPassedRun(run: TddTestRunLike): boolean {
  return run.classification === "passed";
}

function findRun(
  runs: readonly TddTestRunLike[],
  runId: string,
): { run: TddTestRunLike; index: number } | null {
  const index = runs.findIndex((candidate) => candidate.runId === runId);
  if (index < 0) return null;
  return { run: runs[index], index };
}

/** First failed run with a later passed run (record order = chronological). */
function autoDetectPair(
  runs: readonly TddTestRunLike[],
): { redRunId: string; greenRunId: string } | null {
  for (let red = 0; red < runs.length; red++) {
    if (isPassedRun(runs[red])) continue;
    for (let green = red + 1; green < runs.length; green++) {
      if (isPassedRun(runs[green])) {
        return { redRunId: runs[red].runId, greenRunId: runs[green].runId };
      }
    }
  }
  return null;
}

function redGreenRemediation(taskId: string, missing: string): string {
  return (
    `Task ${taskId} is missing ${missing}. Run the red phase first ` +
    `(determinus_run_test with phase:'red', expecting failure), then the green ` +
    `phase (phase:'green', expecting pass), then retry the completion. ` +
    `Pass lastRedRunId/lastGreenRunId explicitly to disambiguate when several runs exist.`
  );
}

export function checkTddOrdering(input: TddOrderingInput): TddOrderingResult {
  const { taskId, runs, refs = {} } = input;
  const enforcement = input.enforcement ?? "strict";
  if (enforcement === "off") return { ok: true };

  const intent = resolveTddIntent(input.intent);
  if (intent === "not_applicable") return { ok: true };

  const refuse = (message: string, remediation: string): TddOrderingResult => {
    if (enforcement === "advisory") {
      return { ok: true, advisory: `${message} ${remediation}` };
    }
    return {
      ok: false,
      code: "TASK_ORDERING_VIOLATION",
      taskId,
      message,
      remediation,
    };
  };

  if (intent === "separate_verification") {
    const ref = refs.lastEvidenceRunId;
    if (!ref) {
      return refuse(
        `Task ${taskId} (tdd_intent separate_verification) has no evidence ref.`,
        `Run the cross-cutting verification (determinus_run_test) and retry with lastEvidenceRunId set to the passing runId.`,
      );
    }
    const found = findRun(runs, ref);
    if (!found) {
      return refuse(
        `Task ${taskId} evidence ref ${ref} matches no recorded run.`,
        `Re-run determinus_run_test and retry with the returned runId as lastEvidenceRunId.`,
      );
    }
    if (!isPassedRun(found.run)) {
      return refuse(
        `Task ${taskId} evidence ref ${ref} did not pass (classification: ${found.run.classification}).`,
        `Re-run until the verification passes, then retry with the passing runId.`,
      );
    }
    return { ok: true };
  }

  // intent === "inline"
  if (refs.lastRedRunId || refs.lastGreenRunId) {
    if (!refs.lastRedRunId || !refs.lastGreenRunId) {
      return refuse(
        `Task ${taskId} supplies a partial red/green pair.`,
        `Supply both lastRedRunId and lastGreenRunId, or omit both for auto-detection.`,
      );
    }
    const red = findRun(runs, refs.lastRedRunId);
    const green = findRun(runs, refs.lastGreenRunId);
    if (!red) {
      return refuse(
        `Task ${taskId} red ref ${refs.lastRedRunId} matches no recorded run.`,
        redGreenRemediation(taskId, "a matching red run"),
      );
    }
    if (!green) {
      return refuse(
        `Task ${taskId} green ref ${refs.lastGreenRunId} matches no recorded run.`,
        redGreenRemediation(taskId, "a matching green run"),
      );
    }
    if (isPassedRun(red.run)) {
      return refuse(
        `Task ${taskId} red ref ${red.run.runId} passed — a red run must fail first.`,
        `Run determinus_run_test with phase:'red' against the failing behavior, then retry.`,
      );
    }
    if (!isPassedRun(green.run)) {
      return refuse(
        `Task ${taskId} green ref ${green.run.runId} did not pass (classification: ${green.run.classification}).`,
        `Run determinus_run_test with phase:'green' until it passes, then retry.`,
      );
    }
    if (green.index <= red.index) {
      return refuse(
        `Task ${taskId} green ref ${green.run.runId} was recorded before red ref ${red.run.runId} — red must come first.`,
        `Re-run red then green in order (or omit refs for auto-detection of a valid pair).`,
      );
    }
    return {
      ok: true,
      pair: { redRunId: red.run.runId, greenRunId: green.run.runId },
    };
  }

  const pair = autoDetectPair(runs);
  if (!pair) {
    const hint =
      runs.length === 0
        ? "no test runs are recorded for this task"
        : "no failed-then-passed sequence exists in the recorded runs";
    return refuse(
      `Task ${taskId} (tdd_intent inline) has no red→green pair: ${hint}.`,
      redGreenRemediation(taskId, "a red→green pair"),
    );
  }
  return { ok: true, pair };
}

/**
 * Execution-gate pairing: every done, non-cancelled code task must carry a
 * red→green pair. Tasks already carrying refs are trusted (checkpoint
 * verified them); the rest are auto-detected. `not_applicable` tasks are
 * exempt; `separate_verification` tasks need at least one passed run.
 *
 * `unpaired` is always populated so advisory callers can surface warnings;
 * only `strict` fails closed.
 */
export interface ExecutionPairingResult {
  ok: boolean;
  unpaired: string[];
  message?: string;
}

export function checkExecutionPairing(input: {
  tasks: ReadonlyArray<{
    id: string;
    status: string;
    metadata?: Record<string, string>;
  }>;
  testRuns: Record<string, readonly TddTestRunLike[] | undefined>;
  enforcement?: TddEnforcement;
}): ExecutionPairingResult {
  const enforcement = input.enforcement ?? "strict";
  if (enforcement === "off") return { ok: true, unpaired: [] };
  const unpaired: string[] = [];
  for (const task of input.tasks) {
    if (task.status !== "done") continue;
    const intent = resolveTddIntent(task.metadata?.tdd_intent);
    if (intent === "not_applicable") continue;
    const runs = input.testRuns[task.id] ?? [];
    if (intent === "separate_verification") {
      if (!runs.some(isPassedRun)) unpaired.push(task.id);
      continue;
    }
    if (!autoDetectPair(runs)) unpaired.push(task.id);
  }
  if (unpaired.length === 0) return { ok: true, unpaired: [] };
  const message =
    `Cannot complete execution: ${unpaired.length} done task(s) without a red→green pair: ${unpaired.join(", ")}. ` +
    `Run determinus_run_test red then green per task (or reclassify tdd_intent with user approval when TDD truly does not apply).`;
  if (enforcement === "advisory") return { ok: true, unpaired, message };
  return { ok: false, unpaired, message };
}
