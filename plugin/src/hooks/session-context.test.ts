import { describe, expect, test } from "vitest";
import {
  DETERMINUS_AGENT_ID,
  DETERMINUS_DIRECTIVE,
  buildDeterminusDirective,
  injectDirective,
  shouldInjectDirective,
} from "../agent-definition";
import {
  enforceSessionContext,
  shouldEnforceForEvent,
} from "./session-context";

describe("determinus agent-definition (ST-02)", () => {
  test("directive carries the gate sequence", () => {
    const directive = buildDeterminusDirective();
    expect(directive).toContain("proposal → discovery → design");
    expect(directive).toContain("acceptance → release → archive");
  });

  test("injection targets only the determinus agent", () => {
    expect(shouldInjectDirective(DETERMINUS_AGENT_ID)).toBe(true);
    expect(shouldInjectDirective("build")).toBe(false);
    expect(shouldInjectDirective(undefined)).toBe(false);
  });

  test("injectDirective is idempotent", () => {
    const once = injectDirective([], DETERMINUS_DIRECTIVE);
    const twice = injectDirective(once, DETERMINUS_DIRECTIVE);
    expect(twice).toHaveLength(1);
  });
});

describe("determinus session-context enforcement (ST-02)", () => {
  test("enforces for primary and compaction, ignores others", () => {
    expect(
      shouldEnforceForEvent({ agent: "determinus", kind: "primary" }),
    ).toBe(true);
    expect(
      shouldEnforceForEvent({ agent: "determinus", kind: "compaction" }),
    ).toBe(true);
    expect(
      shouldEnforceForEvent({ agent: "determinus", kind: "title" }),
    ).toBe(false);
    expect(
      shouldEnforceForEvent({ agent: "determinus", kind: "generate" }),
    ).toBe(false);
    expect(shouldEnforceForEvent({ agent: "build", kind: "primary" })).toBe(
      false,
    );
  });

  test("enforce appends once and survives override-shaped events", () => {
    const event: any = { agent: "determinus", kind: "primary", system: [] };
    enforceSessionContext(event);
    enforceSessionContext(event);
    expect(event.system).toHaveLength(1);
    expect(String(event.system[0])).toContain("proposal → discovery");
  });

  test("enforce never throws on malformed events", () => {
    expect(() => enforceSessionContext(undefined)).not.toThrow();
    expect(() => enforceSessionContext({})).not.toThrow();
    expect(() =>
      enforceSessionContext({ agent: "determinus", system: null }),
    ).not.toThrow();
  });
});
