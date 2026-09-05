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
  /** Failure class for RED validation (ST-08 red_oracle). e.g. assertion_failure, module_not_found. */
  failure_class?: string;
  /** Observable failure signal for oracle matching (substring of output). */
  failure_signal?: string;
  /** Normalized test-definition fingerprint (ST-08). Divergence => RED_STALE. */
  test_fingerprint?: string;
  /** Spec revision hash at run time (ST-09). Mismatch => STALE. */
  spec_revision?: string;
  /** Workspace snapshot id at run time (ST-09 commit/tree SHA or digest). */
  workspace_snapshot?: string;
}

export interface RedOracle {
  /** Allowed failure class; when set, RED must carry this class. */
  allowed_failure_class?: string;
  /** Expected signal substring; when set, RED failure_signal must contain it. */
  expected_signal?: string;
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
  /** Red oracle declared before the run (ST-08). When present, RED must match it. */
  oracle?: RedOracle;
  /** Current spec revision for STALE detection (ST-09). Runs with a different revision are ignored. */
  current_spec_revision?: string;
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
function matchesOracle(run: TddTestRunLike, oracle?: RedOracle): boolean {
  if (!oracle) return true;
  if (
    oracle.allowed_failure_class &&
    run.failure_class &&
    run.failure_class !== oracle.allowed_failure_class
  ) {
    return false;
  }
  if (
    oracle.allowed_failure_class &&
    !run.failure_class &&
    // No class recorded: only accept when no oracle class is demanded.
    true
  ) {
    // Conservative: runs without a recorded class cannot prove the oracle.
    return false;
  }
  if (oracle.expected_signal) {
    const signal = run.failure_signal ?? "";
    if (!signal.includes(oracle.expected_signal)) return false;
  }
  return true;
}

function fingerprintsCompatible(
  red: TddTestRunLike,
  green: TddTestRunLike,
): boolean {
  if (red.test_fingerprint && green.test_fingerprint) {
    return red.test_fingerprint === green.test_fingerprint;
  }
  return true;
}

function isCurrentRevision(
  run: TddTestRunLike,
  current_spec_revision?: string,
): boolean {
  if (!current_spec_revision) return true;
  if (!run.spec_revision) return true;
  return run.spec_revision === current_spec_revision;
}

function autoDetectPair(
  runs: readonly TddTestRunLike[],
  oracle?: RedOracle,
  current_spec_revision?: string,
): { redRunId: string; greenRunId: string } | null {
  for (let red = 0; red < runs.length; red++) {
    if (isPassedRun(runs[red])) continue;
    if (!matchesOracle(runs[red], oracle)) continue;
    if (!isCurrentRevision(runs[red], current_spec_revision)) continue;
    for (let green = red + 1; green < runs.length; green++) {
      if (!isPassedRun(runs[green])) continue;
      if (!isCurrentRevision(runs[green], current_spec_revision)) continue;
      if (!fingerprintsCompatible(runs[red], runs[green])) continue;
      return { redRunId: runs[red].runId, greenRunId: runs[green].runId };
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
    if (input.oracle && !matchesOracle(red.run, input.oracle)) {
      return refuse(
        `Task ${taskId} red ref ${red.run.runId} does not match the declared red_oracle (class/signal mismatch) — RED_AMBIGUOUS, not RED_PROVEN.`,
        `Re-run determinus_run_test with phase:'red' against the expected failing behavior, then retry.`,
      );
    }
    if (!fingerprintsCompatible(red.run, green.run)) {
      return refuse(
        `Task ${taskId} RED_STALE: test fingerprint changed between red ${red.run.runId} and green ${green.run.runId} — the test was weakened, not the code fixed.`,
        `Restore the test definition and re-prove RED, then GREEN.`,
      );
    }
    if (
      input.current_spec_revision &&
      (!isCurrentRevision(red.run, input.current_spec_revision) ||
        !isCurrentRevision(green.run, input.current_spec_revision))
    ) {
      return refuse(
        `Task ${taskId} evidence is STALE for the current spec revision — re-prove RED→GREEN.`,
        `Re-run determinus_run_test red then green against the current spec.`,
      );
    }
    return {
      ok: true,
      pair: { redRunId: red.run.runId, greenRunId: green.run.runId },
    };
  }

  const pair = autoDetectPair(runs, input.oracle, input.current_spec_revision);
  if (!pair) {
    // Specific diagnostics: fingerprint divergence or oracle mismatch, else generic.
    for (let red = 0; red < runs.length; red++) {
      if (isPassedRun(runs[red])) continue;
      for (let green = red + 1; green < runs.length; green++) {
        if (!isPassedRun(runs[green])) continue;
        if (!fingerprintsCompatible(runs[red], runs[green])) {
          return refuse(
            `Task ${taskId} RED_STALE: test fingerprint changed between red ${runs[red].runId} and green ${runs[green].runId} — the test was weakened, not the code fixed.`,
            `Restore the test definition and re-prove RED, then GREEN.`,
          );
        }
        if (input.oracle && !matchesOracle(runs[red], input.oracle)) {
          return refuse(
            `Task ${taskId} red ${runs[red].runId} does not match the declared red_oracle — RED_AMBIGUOUS, not RED_PROVEN.`,
            `Re-run determinus_run_test with phase:'red' against the expected failing behavior, then retry.`,
          );
        }
      }
    }
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
