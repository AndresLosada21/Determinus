/** ST-15: collector joins tool events with usage snapshots (fail-soft). */

import { describe, expect, test } from "vitest";
import { createBustCollector } from "./cache-bust-collector";

describe("bust collector (ST-15)", () => {
  test("pairs before/after into completed calls", () => {
    const col = createBustCollector();
    col.feedTool({ phase: "before", tool: "read", at: 0, args: { path: "a" } });
    col.feedTool({
      phase: "after",
      tool: "read",
      at: 500,
      output: "x".repeat(10),
    });
    expect(col.completed()).toHaveLength(1);
    expect(col.completed()[0]).toMatchObject({ tool: "read", bytesOut: 10 });
  });

  test("unpaired after is dropped, never throws", () => {
    const col = createBustCollector();
    expect(() =>
      col.feedTool({ phase: "after", tool: "ghost", at: 1, output: "x" }),
    ).not.toThrow();
    expect(col.completed()).toHaveLength(0);
  });

  test("collector error never propagates to the host", () => {
    const col = createBustCollector();
    expect(() => col.feedTool(null)).not.toThrow();
    expect(() => col.feedTool({ phase: "before" })).not.toThrow();
    expect(() => col.feedUsage(null)).not.toThrow();
    expect(() =>
      col.feedUsage({ newTokens: -1, cachedTokens: NaN, totalTokens: 0 }),
    ).not.toThrow();
    expect(col.report()).toEqual([]);
  });

  test("report blames the giant output behind the drop", () => {
    const col = createBustCollector({ largeOutputBytes: 100 });
    col.feedUsage({
      at: 0,
      newTokens: 1,
      cachedTokens: 100_000,
      totalTokens: 100_001,
    });
    col.feedTool({ phase: "before", tool: "small", at: 5, args: {} });
    col.feedTool({
      phase: "after",
      tool: "small",
      at: 10,
      output: "y".repeat(200),
    });
    col.feedUsage({
      at: 20,
      newTokens: 90_000,
      cachedTokens: 10_000,
      totalTokens: 100_000,
    });
    const busts = col.report();
    expect(busts).toHaveLength(1);
    expect(busts[0].suspect).toBe("small");
    expect(busts[0].cause).toBe("ours");
  });

  test("idle window without calls attributes unknown-idle", () => {
    const col = createBustCollector();
    col.feedUsage({
      at: 0,
      newTokens: 1,
      cachedTokens: 100_000,
      totalTokens: 100_001,
    });
    col.feedUsage({
      at: 1000,
      newTokens: 90_000,
      cachedTokens: 10_000,
      totalTokens: 100_000,
    });
    const busts = col.report();
    expect(busts).toHaveLength(1);
    expect(busts[0].suspect).toBe("unknown-idle");
    expect(busts[0].cause).toBe("unknown");
  });

  test("first-seen tool attributes ours tools", () => {
    const col = createBustCollector();
    col.feedUsage({
      at: 0,
      newTokens: 1,
      cachedTokens: 100_000,
      totalTokens: 100_001,
    });
    col.feedTool({ phase: "before", tool: "read", at: 5, args: {} });
    col.feedTool({ phase: "after", tool: "read", at: 10, output: "x" });
    col.feedUsage({
      at: 15,
      newTokens: 1,
      cachedTokens: 100_000,
      totalTokens: 100_001,
    });
    col.feedTool({ phase: "before", tool: "brand-new-tool", at: 20, args: {} });
    col.feedTool({
      phase: "after",
      tool: "brand-new-tool",
      at: 25,
      output: "y",
    });
    col.feedUsage({
      at: 30,
      newTokens: 90_000,
      cachedTokens: 10_000,
      totalTokens: 100_000,
    });
    const busts = col.report();
    expect(busts).toHaveLength(1);
    expect(busts[0].suspect).toBe("brand-new-tool");
    expect(busts[0].cause).toBe("ours");
    expect(busts[0].evidence.join(" ")).toMatch(/tool inventory/);
  });

  test("model id in usage snapshots attributes ours model on switch", () => {
    const col = createBustCollector();
    col.feedUsage({
      at: 0,
      newTokens: 1,
      cachedTokens: 100_000,
      totalTokens: 100_001,
      model: "opencode-go/muse-spark-1.3-contributor",
    });
    col.feedUsage({
      at: 1000,
      newTokens: 90_000,
      cachedTokens: 10_000,
      totalTokens: 100_000,
      model: "opencode-go/omen-alpha",
    });
    const busts = col.report();
    expect(busts).toHaveLength(1);
    expect(busts[0].cause).toBe("ours");
    expect(busts[0].evidence.join(" ")).toMatch(/model/);
  });

  test("non-string model in usage snapshots never throws", () => {
    const col = createBustCollector();
    col.feedUsage({
      at: 0,
      newTokens: 1,
      cachedTokens: 100_000,
      totalTokens: 100_001,
      model: { id: "x" },
    });
    col.feedUsage({
      at: 1000,
      newTokens: 1,
      cachedTokens: 90_000,
      totalTokens: 90_001,
      model: 42,
    });
    const busts = col.report();
    expect(busts).toHaveLength(1);
    expect(busts[0].evidence.join(" ")).not.toMatch(/model .*→/);
  });

  test("realistic host after-shape (content array) measures text bytes", () => {
    const col = createBustCollector();
    col.feedTool({
      phase: "before",
      tool: "read",
      at: 0,
      callId: "call-1",
      args: { path: "a" },
    });
    col.feedTool({
      phase: "after",
      tool: "read",
      at: 10,
      callId: "call-1",
      output: { content: [{ type: "text", text: "hello" }] },
    });
    expect(col.completed()).toHaveLength(1);
    expect(col.completed()[0].bytesOut).toBeGreaterThan(5);
  });
});
