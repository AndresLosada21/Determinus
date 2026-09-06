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

  test("flat or rising cache means no bust", () => {
    const flat = appendStep(
      appendStep([], step({ at: 0, cachedTokens: 100_000, tool: "a" })),
      step({ at: 1000, cachedTokens: 100_000, tool: "b" }),
    );
    expect(detectBusts(flat)).toHaveLength(0);
    const rising = appendStep(
      appendStep([], step({ at: 0, cachedTokens: 100_000, tool: "a" })),
      step({ at: 1000, cachedTokens: 120_000, tool: "b" }),
    );
    expect(detectBusts(rising)).toHaveLength(0);
  });

  test("custom threshold still filters small drops (edge exclusive)", () => {
    const steps = appendStep(
      appendStep([], step({ at: 0, cachedTokens: 100_000, tool: "a" })),
      // Exactly at the 50% custom threshold: NOT a bust (strictly greater).
      step({ at: 1000, cachedTokens: 50_000, tool: "b" }),
    );
    expect(detectBusts(steps, { dropThreshold: 0.5 })).toHaveLength(0);
  });

  test("tiny drops are tracked by default", () => {
    const steps = appendStep(
      appendStep([], step({ at: 0, cachedTokens: 100_000, tool: "a" })),
      step({ at: 1000, cachedTokens: 97_000, tool: "b" }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].cause).toBe("unknown");
    expect(busts[0].evidence.join(" ")).toMatch(/-3%/);
  });

  test("model switch attributes ours model (regression: spark→omen -97%)", () => {
    const steps = appendStep(
      appendStep(
        [],
        step({
          at: 0,
          cachedTokens: 102_769,
          model: "opencode-go/muse-spark-1.3-contributor",
          tool: "shell",
        }),
      ),
      step({
        at: 1000,
        cachedTokens: 2_880,
        model: "opencode-go/omen-alpha",
        tool: "shell",
      }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].cause).toBe("ours");
    expect(busts[0].evidence.join(" ")).toMatch(/model .*→/);
    expect(busts[0].recommendation).toMatch(/one model per session/i);
  });

  test("model switch wins over simultaneous tool inventory change", () => {
    const steps = appendStep(
      appendStep(
        [],
        step({ at: 0, model: "p/a", tool: "shell", toolCount: 10 }),
      ),
      step({
        at: 1000,
        cachedTokens: 5_000,
        model: "p/b",
        tool: "shell",
        toolCount: 12,
      }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].evidence.join(" ")).toMatch(/model/);
  });

  test("same model never triggers the model cause", () => {
    const steps = appendStep(
      appendStep([], step({ at: 0, model: "p/a", tool: "shell" })),
      step({ at: 1000, cachedTokens: 97_000, model: "p/a", tool: "shell" }),
    );
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(1);
    expect(busts[0].evidence.join(" ")).not.toMatch(/model .*→/);
  });

  test("ranking is biggest-drop-first", () => {
    const steps = [
      step({ at: 0, cachedTokens: 100_000, tool: "small" }),
      step({ at: 1000, cachedTokens: 95_000, tool: "mid" }),
      step({ at: 2000, cachedTokens: 10_000, tool: "big" }),
    ];
    const busts = detectBusts(steps);
    expect(busts).toHaveLength(2);
    expect(busts[0].stepIndex).toBe(2);
    expect(busts[1].stepIndex).toBe(1);
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
