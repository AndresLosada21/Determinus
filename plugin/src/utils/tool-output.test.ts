import { describe, expect, it, vi } from "vitest";

import { formatToolOutput, resolveOutputMode } from "./tool-output";

describe("tool-output", () => {
  it("truncates objects containing undefined values without throwing", () => {
    const raw = formatToolOutput(
      {
        small: "kept",
        missing: undefined,
        nested: {
          alsoMissing: undefined,
        },
        large: "x".repeat(2_000),
      },
      { maxChars: 300 },
    );

    const parsed = JSON.parse(raw);
    expect(parsed._truncated).toBe(true);
    expect(parsed.data.small).toBe("kept");
  });
});

describe("resolveOutputMode", () => {
  it("returns true when arg is pretty (arg overrides compact env)", () => {
    expect(resolveOutputMode("pretty")).toBe(true);
  });

  it("returns false when arg is compact (arg overrides pretty env)", () => {
    expect(resolveOutputMode("compact")).toBe(false);
  });

  it("returns false when arg is omitted and env is compact (default)", () => {
    expect(resolveOutputMode(undefined)).toBe(false);
  });

  it("returns true when arg is omitted and env is pretty (env fallback)", async () => {
    vi.stubEnv("determinus_TOOL_OUTPUT_MODE", "pretty");
    vi.resetModules();
    const { resolveOutputMode: freshResolve } = await import("./tool-output");
    expect(freshResolve(undefined)).toBe(true);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns false for explicit compact even when env is pretty (arg precedence)", async () => {
    vi.stubEnv("determinus_TOOL_OUTPUT_MODE", "pretty");
    vi.resetModules();
    const { resolveOutputMode: freshResolve } = await import("./tool-output");
    // This is the key case the validator flagged: arg MUST override env
    expect(freshResolve("compact")).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

it("retains full producer data before truncating its preview", async () => {
  const { readFileSync, rmSync } = await import("node:fs");
  const original = {
    success: false,
    details: "required-evidence".repeat(1000),
    sessions: [{ id: "fixture" }],
  };
  const result = JSON.parse(formatToolOutput(original));
  try {
    expect(JSON.parse(readFileSync(result._fullResult, "utf8"))).toEqual(
      original,
    );
    expect(readFileSync(result._fullResult + ".txt", "utf8")).toContain(
      original.details,
    );
    expect(result._meta.returnedChars).toBe(JSON.stringify(result).length);
  } finally {
    rmSync(result._fullResult, { force: true });
    rmSync(result._fullResult + ".txt", { force: true });
  }
});
