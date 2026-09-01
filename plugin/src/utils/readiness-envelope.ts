export const determinus_SESSION_NOT_READY_KIND =
  "determinus_SESSION_NOT_READY" as const;
export const determinus_PLUGIN_INIT_FAILED_STATUS =
  "determinus_PLUGIN_INIT_FAILED" as const;
export const NO_POLLER_CLASS = "no_poller" as const;
export const determinus_SESSION_READINESS_RETRY_HINT =
  "ADV session not ready; orphan-adoption heartbeat runs on a ~10s cadence. retry-after-heartbeat: wait for the next heartbeat and retry. Do not rely on an exact ETA because poller staleness cannot distinguish queue saturation from shutdown." as const;

export interface AdvSessionNotReadyRetryHint {
  heartbeatCadenceMs: 10_000;
  advise: "retry-after-heartbeat";
  message: string;
}

export interface AdvSessionNotReady {
  kind: typeof determinus_SESSION_NOT_READY_KIND;
  blockers: string[];
  retryHint: string;
}

export interface AdvPluginInitFailedLike {
  status: "determinus_PLUGIN_INIT_FAILED";
  message: string;
  error: string;
  directory: string;
  remediation: string[];
}

export function isAdvSessionNotReady(
  value: unknown,
): value is AdvSessionNotReady {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === determinus_SESSION_NOT_READY_KIND
  );
}

export function isAdvPluginInitFailed(
  value: unknown,
): value is AdvPluginInitFailedLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status ===
      determinus_PLUGIN_INIT_FAILED_STATUS
  );
}

export function isNoPoller(value: unknown): value is { class: "no_poller" } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { class?: unknown }).class === NO_POLLER_CLASS
  );
}

export type ClassifiedAdvEnvelope =
  | { kind: "session-not-ready"; payload: AdvSessionNotReady }
  | { kind: "init-failed" }
  | { kind: "no-poller" }
  | { kind: "unknown" };

export function classifyAdvEnvelope(value: unknown): ClassifiedAdvEnvelope {
  if (isAdvSessionNotReady(value))
    return { kind: "session-not-ready", payload: value };
  if (isAdvPluginInitFailed(value)) return { kind: "init-failed" };
  if (isNoPoller(value)) return { kind: "no-poller" };
  return { kind: "unknown" };
}

export function createAdvSessionNotReadyEnvelope(
  blockers: string[],
  retryHint = determinus_SESSION_READINESS_RETRY_HINT,
): AdvSessionNotReady {
  return {
    kind: determinus_SESSION_NOT_READY_KIND,
    blockers: [...new Set([determinus_SESSION_NOT_READY_KIND, ...blockers])],
    retryHint,
  };
}

export function getAdvSessionNotReadyRetryHint(): AdvSessionNotReadyRetryHint {
  return {
    heartbeatCadenceMs: 10_000,
    advise: "retry-after-heartbeat",
    message: determinus_SESSION_READINESS_RETRY_HINT,
  };
}
