import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseFrontmatterText,
  parseFrontmatter,
  assertPolicyMatch,
  scanDir,
  runtimeFrontmatterCheck,
} from "./manifest-frontmatter";

describe("parseFrontmatterText", () => {
  it("returns ok=false with error for a blockquote inside frontmatter", () => {
    const text = `---
name: determinus-tron
tools:
  determinus_*: false
> **Invoke routing:** this breaks YAML
  determinus_spec: true
---
body text`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("Implicit keys");
  });

  it("returns ok=false for unquoted colon-space in a scalar value", () => {
    const text = `---
name: determinus-archive
description: Archive completed change: apply spec deltas
---`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns ok=true with parsed doc for valid frontmatter", () => {
    const text = `---
name: determinus-verifier
description: "Verify things"
tools:
  determinus_*: false
  determinus_spec: true
---
body`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(true);
    expect(result.doc).not.toBeNull();
    expect((result.doc as Record<string, unknown>).name).toBe(
      "determinus-verifier",
    );
  });

  it("returns ok=true with null doc when there is no frontmatter", () => {
    const text = `# Just a body
No frontmatter here.`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(true);
    expect(result.doc).toBeNull();
  });

  it("returns ok=false for unterminated frontmatter", () => {
    const text = `---
name: broken
tools:
  determinus_*: false
no closing marker`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not terminated");
  });
});

describe("parseFrontmatter (file I/O)", () => {
  const tmp = join(tmpdir(), `fm-test-${Date.now()}`);

  it("reads and parses a file from disk", () => {
    mkdirSync(tmp, { recursive: true });
    const filePath = join(tmp, "agent.md");
    writeFileSync(
      filePath,
      `---
name: x
tools:
  determinus_spec: true
---
body`,
    );
    const result = parseFrontmatter(filePath);
    expect(result.ok).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns ok=true with null doc for a missing file", () => {
    const result = parseFrontmatter(join(tmp, "nonexistent.md"));
    expect(result.ok).toBe(true);
    expect(result.doc).toBeNull();
  });
});

describe("assertPolicyMatch", () => {
  it("detects an empty tools map", () => {
    const doc = { name: "determinus-engineer", tools: {} };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "determinus-engineer",
    );
    expect(result.ok).toBe(false);
    expect(result.drift).toContain("tools map is empty");
  });

  it("detects a missing tools key entirely", () => {
    const doc = { name: "determinus-engineer" };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "determinus-engineer",
    );
    expect(result.ok).toBe(false);
  });

  it("detects drifted determinus_* grants", () => {
    // determinus-verifier's policy allows 11 Tier-1 tools; give it only 2
    const doc = {
      tools: {
        "determinus_*": false,
        determinus_change_show: true,
        determinus_tool_catalog: true,
      },
    };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "determinus-verifier",
    );
    expect(result.ok).toBe(false);
    expect(result.drift).toBeTruthy();
    expect(result.drift!.length).toBeGreaterThan(0);
  });

  it("passes when grants match the declared policy", () => {
    // Build a doc that matches determinus-verifier's policy exactly
    // determinus-verifier gets the 16-tool Tier-1 allowlist + determinus_*: false
    const tier1 = [
      "determinus_change_archive",
      "determinus_change_close",
      "determinus_change_create",
      "determinus_change_list",
      "determinus_change_show",
      "determinus_change_update",
      "determinus_gate_complete",
      "determinus_gate_status",
      "determinus_run_test",
      "determinus_subagent_report_submit",
      "determinus_task_add",
      "determinus_task_checkpoint",
      "determinus_task_list",
      "determinus_task_update",
      "determinus_tool_catalog",
      "determinus_tool_invoke",
    ];
    const tools: Record<string, boolean> = { "determinus_*": false };
    for (const t of tier1) tools[t] = true;
    const doc = { tools };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "determinus-verifier",
    );
    expect(result.ok).toBe(true);
  });
});

describe("scanDir", () => {
  const tmp = join(tmpdir(), `fm-scan-${Date.now()}`);

  it("aggregates per-file results and reports failures", () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, "clean.md"),
      `---
name: clean
tools:
  determinus_spec: true
---
body`,
    );
    writeFileSync(
      join(tmp, "broken.md"),
      `---
name: broken
> **bad line**
---
body`,
    );
    const result = scanDir(tmp);
    expect(result.checked).toBe(2);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].file).toContain("broken.md");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("runtimeFrontmatterCheck", () => {
  it("reports failures for broken files and respects budget", () => {
    const tmp = join(tmpdir(), `fm-rt-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, "clean.md"),
      `---
name: clean
tools:
  determinus_spec: true
---
body`,
    );
    writeFileSync(
      join(tmp, "broken.md"),
      `---
name: broken
> **bad**
---
body`,
    );

    const result = runtimeFrontmatterCheck(300, [tmp]);
    expect(result.checked).toBe(2);
    expect(result.failures).toBe(1);
    expect(result.elapsedMs).toBeLessThan(300);
    expect(result.budgetExceeded).toBe(false);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("stops scanning when budget is exceeded", () => {
    // Use an absurdly small budget to force early exit
    const tmp = join(tmpdir(), `fm-budget-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    for (let i = 0; i < 50; i++) {
      writeFileSync(join(tmp, `f${i}.md`), `---\nname: f${i}\n---\n`);
    }
    const result = runtimeFrontmatterCheck(0, [tmp]);
    expect(result.budgetExceeded).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("handles a nonexistent directory gracefully", () => {
    const result = runtimeFrontmatterCheck(300, [
      join(tmpdir(), `nonexistent-${Date.now()}`),
    ]);
    expect(result.checked).toBe(0);
    expect(result.failures).toBe(0);
  });
});
