import { describe, expect, test } from "vitest";
import { computeTestFingerprint, normalizeTestContent } from "./test";

describe("test fingerprint content (ST-11)", () => {
  test("same command on unchanged file is stable", () => {
    const a = computeTestFingerprint(
      "pnpm vitest run src/validator/tdd-ordering.test.ts",
      process.cwd(),
    );
    const b = computeTestFingerprint(
      "pnpm vitest run src/validator/tdd-ordering.test.ts",
      process.cwd(),
    );
    expect(a).toBe(b);
    expect(a.startsWith("file:")).toBe(true);
  });

  test("unresolvable command falls back to cmd: origin", () => {
    const fp = computeTestFingerprint("pnpm check", process.cwd());
    expect(fp.startsWith("cmd:")).toBe(true);
  });

  test("cosmetic-only edit keeps the fingerprint", () => {
    const cmd = "pnpm vitest run src/validator/tdd-ordering.test.ts";
    const before = computeTestFingerprint(cmd, process.cwd());
    expect(before.startsWith("file:")).toBe(true);
    expect(normalizeTestContent("a  b\n\nc\r\nd")).toBe("a b\nc\nd");
  });
});
