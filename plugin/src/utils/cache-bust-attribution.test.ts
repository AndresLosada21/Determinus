/** ST-15: pure bust-attribution core — drop detection + suspect ranking. */

import { describe, expect, test } from "vitest";
import {
  appendStep,
  detectBusts,
  type UsageStep,
} from "./cache-bust-attribution";

function step(partial: Partial<UsageStep> & { tool: string }): UsageStep {
  return {
    at: 0,
    bytesIn: 100,
    bytesOut: 100,
    cachedTokens: 100_000,
    dir: "C:/proj",
    newTokens: 1000,
    toolCount: 10,
    totalTokens: 101_000,
    ...partial,
  };
}

describe("cache-bust attribution core (ST-15)", () => {
  test("giant unique output attributes ours to the preceding call", () => {
    const steps = appendStep(
      appendStep(
        [],
        step({ at: 0, bytesOut: 103_000, cachedTokens: 100_000, tool: "read" }),
      ),
      step({ at: 1000, cachedTokens: 30_000, tool: "read" }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].suspect).toBe("read");
    expect(busts[0].cause).toBe("ours");
    expect(busts[0].evidence.join(" ")).toMatch(/103/);
  });

  test("long idle gap attributes host ttl", () => {
    const steps = appendStep(
      appendStep([], step({ at: 0, tool: "grep" })),
      step({ at: 5 * 60_000, cachedTokens: 10_000, tool: "grep" }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].cause).toBe("host");
  });

  test("no drop means no bust (threshold edge is exclusive)", () => {
    const steps = appendStep(
      appendStep([], step({ at: 0, cachedTokens: 100_000, tool: "a" })),
      // Exactly at the 50% default threshold: NOT a bust (strictly greater).
      step({ at: 1000, cachedTokens: 50_000, tool: "b" }),
    );
    expect(detectBusts(steps)).toHaveLength(0);
  });

  test("cwd change attributes ours move", () => {
    const steps = appendStep(
      appendStep([], step({ at: 0, tool: "shell" })),
      step({ cachedTokens: 5_000, dir: "C:/other", tool: "shell" }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].cause).toBe("ours");
    expect(busts[0].evidence.join(" ")).toMatch(/cwd|dir/i);
  });

  test("real incident: 119KB-new call behind a 117k cached drop", () => {
    // Session footer 2026-09-06: tool-call 119.015 new, then "likely cache
    // bust: 117.632 fewer cached tokens". The drop must blame that call.
    const withOutput = [
      {
        ...step({ at: 0, cachedTokens: 212_849, tool: "setup" }),
        bytesOut: 119_015,
      },
      step({ at: 1000, cachedTokens: 212_849 - 117_632, tool: "setup" }),
    ];
    const busts = detectBusts(withOutput);
    expect(busts).toHaveLength(1);
    expect(busts[0].cause).toBe("ours");
    expect(busts[0].evidence.join(" ")).toContain("119015");
  });
});
