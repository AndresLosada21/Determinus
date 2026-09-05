/** ST-14: failure-signal robustness — ANSI strip + assertion-line preference. */

import { describe, expect, test } from "vitest";
import {
  classifyFailureClass,
  extractFailureSignal,
  stripAnsiTerminal,
} from "./test";

// Realistic colorized vitest failure tail: assertion in the middle,
// summary ("Duration") last — the old last-line heuristic returned "Duration".
const VITEST_FAIL_TAIL = [
  "\u001b[31m FAIL \u001b[39m src/x.test.ts > probe > red case",
  "\u001b[31mAssertionError\u001b[39m: expected 200 to be 401 // Object.is equality",
  "",
  "\u001b[2m Test Files \u001b[22m 1 failed (1)",
  "\u001b[2m   Duration \u001b[22m 289ms",
].join("\n");

describe("failure signal robustness (ST-14)", () => {
  test("stripAnsiTerminal removes escapes, keeps text", () => {
    expect(stripAnsiTerminal("\u001b[31mFAIL\u001b[39m ok")).toBe("FAIL ok");
    expect(stripAnsiTerminal("plain")).toBe("plain");
  });

  test("signal prefers the assertion line over the tail", () => {
    const signal = extractFailureSignal(VITEST_FAIL_TAIL);
    expect(signal).toContain("expected 200");
  });

  test("classification works on colorized output", () => {
    expect(classifyFailureClass(VITEST_FAIL_TAIL, 1)).toBe("assertion_failure");
    expect(classifyFailureClass("Cannot find module 'x'", 1)).toBe(
      "module_not_found",
    );
  });

  test("fallback keeps last-line behavior without assertion", () => {
    expect(extractFailureSignal("boom\nbam")).toBe("bam");
  });
});
