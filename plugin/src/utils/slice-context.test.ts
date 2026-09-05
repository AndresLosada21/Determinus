import { describe, expect, test } from "vitest";
import { buildSliceContext } from "./slice-context";

const change = {
  id: "c1",
  design: "Use AuthService.authenticate().",
  tasks: [
    { id: "tk-1", title: "P1 slice", status: "pending" },
    { id: "tk-2", title: "P2 slice", status: "pending" },
  ],
};

describe("slice-context (ST-10)", () => {
  test("pending slice exposes TEST_READY with test-only allowed", () => {
    const ctx = buildSliceContext(change, "tk-1");
    expect(ctx.active_slice).toBe("tk-1");
    expect(ctx.tdd_state).toBe("TEST_READY");
    expect(ctx.allowed.join(" ")).toMatch(/edit tests|run/i);
    expect(ctx.forbidden.join(" ")).toMatch(/production|complete/i);
  });

  test("in_progress slice targets GREEN", () => {
    const ctx = buildSliceContext(
      { ...change, tasks: [{ id: "tk-1", title: "P1", status: "in_progress" }] },
      "tk-1",
    );
    expect(ctx.tdd_state).toMatch(/RED_PROVEN|IMPLEMENTING/);
    expect(ctx.target).toMatch(/GREEN/);
  });

  test("packet is sliced, not whole change", () => {
    const ctx = buildSliceContext(change, "tk-2");
    expect(ctx.active_slice).toBe("tk-2");
    expect(JSON.stringify(ctx).length).toBeLessThan(JSON.stringify(change).length + 2000);
  });
});
