import { describe, expect, test } from "vitest";
import {
  DETERMINUS_AGENT_ID,
  DETERMINUS_DIRECTIVE,
  appendSystemText,
  buildDeterminusDirective,
  hasDirectiveEntry,
  injectDirective,
  makeSystemEntry,
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
    expect(shouldEnforceForEvent({ agent: "determinus", kind: "title" })).toBe(
      false,
    );
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
    expect(event.system[0]).toEqual({
      type: "text",
      text: expect.stringContaining("proposal → discovery"),
    });
  });

  test("enforce appends a struct, never a raw string (host schema)", () => {
    const event: any = {
      agent: "determinus",
      kind: "primary",
      system: [{ type: "text", text: "host prompt" }],
    };
    enforceSessionContext(event);
    for (const part of event.system) {
      expect(typeof part).not.toBe("string");
    }
    expect(event.system[1]).toEqual({
      type: "text",
      text: expect.stringContaining("proposal → discovery"),
    });
  });

  test("enforce detects the directive inside struct entries", () => {
    const event: any = {
      agent: "determinus",
      kind: "primary",
      system: [makeSystemEntry(DETERMINUS_DIRECTIVE)],
    };
    enforceSessionContext(event);
    expect(event.system).toHaveLength(1);
  });

  test("enforce never throws on malformed events", () => {
    expect(() => enforceSessionContext(undefined)).not.toThrow();
    expect(() => enforceSessionContext({})).not.toThrow();
    expect(() =>
      enforceSessionContext({ agent: "determinus", system: null }),
    ).not.toThrow();
  });
});

describe("appendSystemText (host SystemPart shape)", () => {
  test("appends { type: text, text } entries idempotently", () => {
    const system: unknown[] = [];
    expect(appendSystemText(system, "hello")).toBe(true);
    expect(system).toEqual([{ type: "text", text: "hello" }]);
    expect(appendSystemText(system, "hello")).toBe(false);
    expect(system).toHaveLength(1);
  });

  test("refuses non-array targets without throwing", () => {
    expect(appendSystemText(undefined, "x")).toBe(false);
    expect(appendSystemText(null, "x")).toBe(false);
    expect(appendSystemText("system", "x")).toBe(false);
  });

  test("hasDirectiveEntry sees both string and struct entries", () => {
    expect(hasDirectiveEntry([])).toBe(false);
    expect(hasDirectiveEntry([DETERMINUS_DIRECTIVE])).toBe(true);
    expect(hasDirectiveEntry([makeSystemEntry(DETERMINUS_DIRECTIVE)])).toBe(
      true,
    );
    expect(hasDirectiveEntry([{ type: "text", text: "other" }])).toBe(false);
  });
});
