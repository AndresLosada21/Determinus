import { describe, expect, test } from "vitest";
import { buildSliceContext } from "./slice-context";
import { renderBriefingPacket } from "./briefing-packet-renderer";

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
      {
        ...change,
        tasks: [{ id: "tk-1", title: "P1", status: "in_progress" }],
      },
      "tk-1",
    );
    expect(ctx.tdd_state).toMatch(/RED_PROVEN|IMPLEMENTING/);
    expect(ctx.target).toMatch(/GREEN/);
  });

  test("slice reaches the rendered packet (ST-13 presence, not size)", () => {
    const ctx = buildSliceContext(change, "tk-2");
    const packet = renderBriefingPacket({
      change_id: "c1",
      title: "ST-10 change",
      lane: "engineer",
      tasks: change.tasks,
      active_slice: ctx,
    });
    const slice = packet.sections.find((s) => s.kind === "active_slice");
    expect(slice).toBeDefined();
    expect(JSON.stringify(slice?.content)).toContain("tk-2");
  });
});
