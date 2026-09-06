/** ST-15: top busts projected into diagnostics (sanitized, bounded). */

import { mkdtempSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { installCacheRuntime } from "./cache-runtime";

function fixtureCtx(directory: string, file: string) {
  const callbacks = new Map<string, (...args: unknown[]) => unknown>();
  const reg = async (name: string, fn: (...args: unknown[]) => unknown) => {
    callbacks.set(name, fn);
    return { dispose: async () => {} };
  };
  void file;
  return {
    callbacks,
    ctx: {
      app: { name: "OpenCode-test", version: "beta" },
      location: { directory },
      catalog: {
        transform: async (fn: (...args: unknown[]) => unknown) => {
          fn({
            provider: { list: () => [], update: () => {} },
            model: { update: () => {} },
          });
          return { dispose: async () => {} };
        },
      },
      session: { hook: reg },
      tool: { hook: reg },
    },
  };
}

describe("bust diagnostics exposure (ST-15)", () => {
  test("top busts land sanitized in the diagnostics file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "det-bust-diag-"));
    const file = join(
      homedir(),
      ".local/share/Determinus/diagnostics",
      `cache-${createHash("sha256").update(directory).digest("hex").slice(0, 16)}-${process.pid}.json`,
    );
    const { ctx } = fixtureCtx(directory, file);
    const close = await installCacheRuntime(ctx, {
      getBustReport: () => [
        {
          suspect: "read",
          cause: "ours",
          evidence: [
            "cwd C:\\Users\\carlos\\a→C:\\Users\\carlos\\b (session_move)",
          ],
          recommendation: "Avoid session_move.",
        },
      ],
    });
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      expect(data.topBusts).toHaveLength(1);
      expect(data.topBusts[0].suspect).toBe("read");
      const blob = JSON.stringify(data.topBusts);
      expect(blob).not.toMatch(/[A-Za-z]:\\/);
      expect(blob).not.toContain("real-session");
    } finally {
      await close();
      rmSync(file, { force: true });
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
