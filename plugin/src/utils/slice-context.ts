/**
 * Slice Context Projection (ST-10, alto-ROI P3).
 *
 * Pure service: receives the whole change graph and returns ONLY the active
 * slice + relevant scenario/design/testcase + TDD state + allowed/forbidden.
 * Reduces token usage and agent drift. No IO, no store.
 */

export type SliceTddState =
  | "TEST_READY"
  | "RED_PROVEN"
  | "IMPLEMENTING"
  | "VERIFIED";

export interface SliceTaskLike {
  id: string;
  title?: string;
  status?: string;
}

export interface SliceChangeLike {
  id: string;
  design?: string;
  tasks?: SliceTaskLike[];
}

export interface SliceContext {
  active_slice: string;
  scenario: string;
  design: string;
  tdd_state: SliceTddState;
  allowed: string[];
  forbidden: string[];
  target: string;
}

function inferTddState(status?: string): SliceTddState {
  if (status === "done") return "VERIFIED";
  if (status === "in_progress") return "RED_PROVEN";
  return "TEST_READY";
}

export function buildSliceContext(
  change: SliceChangeLike,
  activeTaskId?: string,
): SliceContext {
  const tasks = change.tasks ?? [];
  const active =
    tasks.find((t) => t.id === activeTaskId) ??
    tasks.find((t) => t.status === "in_progress") ??
    tasks.find((t) => t.status === "pending") ??
    tasks[0];
  const activeId = active?.id ?? "";
  const scenario = active?.title ?? "";
  const design = change.design ?? "";
  const tdd_state = inferTddState(active?.status);
  if (tdd_state === "TEST_READY") {
    return {
      active_slice: activeId,
      scenario,
      design,
      tdd_state,
      allowed: ["edit tests", "run active TestCase"],
      forbidden: ["production behavior changes", "complete task"],
      target: "reach RED_PROVEN",
    };
  }
  if (tdd_state === "VERIFIED") {
    return {
      active_slice: activeId,
      scenario,
      design,
      tdd_state,
      allowed: ["read evidence"],
      forbidden: ["re-edit without new slice"],
      target: "next slice",
    };
  }
  return {
    active_slice: activeId,
    scenario,
    design,
    tdd_state: active?.status === "in_progress" ? "RED_PROVEN" : "IMPLEMENTING",
    allowed: ["production edits", "run focused test"],
    forbidden: ["complete task before GREEN+VERIFY"],
    target: "reach GREEN",
  };
}
