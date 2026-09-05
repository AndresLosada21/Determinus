import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { AGENT_TOOL_POLICY } from "../src/tool-role-policy";
import { determinus_TOOL_NAMES } from "../src/tool-registry";
import {
  generateAdvToolsBlock,
  generateManifestContent,
  isLegacyManagedManifest,
  runGenerate,
  ADV_TOOLS_BLOCK_START,
  ADV_TOOLS_BLOCK_END,
} from "./generate-agent-manifests";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "generate-agent-manifests-"));
}

/**
 * Synthetic legacy-managed fixture base: policy-accurate content the
 * generator normalizes idempotently. Self-contained — no dependency on
 * committed agent files (the baseline ships v2-native manifests only).
 */
function sentinelBase(agent = "determinus"): string {
  return [
    "---",
    `description: test ${agent}`,
    "tools:",
    "  read: true",
    "  determinus_*: false",
    "  determinus_change_list: true",
    "---",
    "body",
  ].join("\n");
}

function writeSentinelFixture(targetDir: string, agent = "determinus"): string {
  const path = join(targetDir, `${agent}.md`);
  writeFileSync(
    path,
    generateManifestContent(sentinelBase(agent), agent),
    "utf8",
  );
  return path;
}

function assertValidAdvBlock(block: string): void {
  const retained = new Set(determinus_TOOL_NAMES);
  retained.add("adv_*");
  retained.add("determinus_*");
  const lines = block.split("\n");
  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const match = line.match(
      /^\s+((?:adv|determinus)_[A-Za-z0-9_*]+):\s*(true|false)\s*$/,
    );
    expect(
      match,
      `every non-comment line must be a valid adv_* entry, got: ${line}`,
    ).toBeTruthy();
    expect(
      retained.has(match![1]),
      `${match![1]} must be a registered ADV tool or wildcard`,
    ).toBe(true);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markerCount(content: string, marker: string): number {
  return (
    content.match(new RegExp(`^\\s*${escapeRegExp(marker.trim())}$`, "gm")) ||
    []
  ).length;
}

describe("generate-agent-manifests", () => {
  test("generateAdvToolsBlock is deterministic", () => {
    const first = generateAdvToolsBlock("determinus");
    const second = generateAdvToolsBlock("determinus");
    expect(first).toBe(second);
  });

  test("generateAdvToolsBlock emits only registered ADV tool names", () => {
    for (const policy of AGENT_TOOL_POLICY) {
      const block = generateAdvToolsBlock(policy.agent);
      assertValidAdvBlock(block);
    }
  });

  test("generateManifestContent is idempotent (generate ∘ generate == generate)", () => {
    const once = generateManifestContent(sentinelBase(), "determinus");
    expect(markerCount(once, ADV_TOOLS_BLOCK_START)).toBe(1);
    expect(generateManifestContent(once, "determinus")).toBe(once);
  });

  test("generateManifestContent inserts markers on first-run and round-trips", () => {
    const agent = "determinus";
    const base = [
      "---",
      "description: test",
      "tools:",
      "  read: true",
      "  # === ADV role policy ===",
      "  adv_*: false",
      "  adv_spec: true",
      "  adv_change_create: false",
      "  task: false",
      "---",
      "body",
    ].join("\n");
    const generated = generateManifestContent(base, agent);
    expect(markerCount(generated, ADV_TOOLS_BLOCK_START)).toBe(1);
    expect(markerCount(generated, ADV_TOOLS_BLOCK_END)).toBe(1);
    const twice = generateManifestContent(generated, agent);
    expect(twice).toBe(generated);
    // Bytes outside the adv_* region are preserved.
    expect(generated).toContain("read: true");
    expect(generated).toContain("task: false");
    expect(generated).toContain("body");
  });

  test("generateManifestContent preserves bytes outside markers", () => {
    const agent = "determinus";
    const beforeText = "---\ndescription: test\ntools:\n  read: true\n";
    const afterText = "  task: false\n---\nbody\nmore body";
    const base = `${beforeText}  adv_*: false\n  adv_spec: true\n${afterText}`;
    const generated = generateManifestContent(base, agent);
    const [before, after] = generated.split(ADV_TOOLS_BLOCK_START);
    expect(before).toContain("read: true");
    expect(after).toContain("task: false");
    expect(after).toContain("body\nmore body");
  });

  test("generateManifestContent preserves hand-owned non-adv_* lines inside the generated region", () => {
    const original = generateManifestContent(sentinelBase(), "determinus");
    const endMarker = original.indexOf(ADV_TOOLS_BLOCK_END);
    expect(endMarker).toBeGreaterThan(-1);
    const handOwnedLine = "  # Hand-owned non-adv_* line";
    const modified =
      original.slice(0, endMarker) +
      handOwnedLine +
      "\n" +
      original.slice(endMarker);
    const generated = generateManifestContent(modified, "determinus");
    expect(generated).toContain(handOwnedLine);
    const twice = generateManifestContent(generated, "determinus");
    expect(twice).toBe(generated);
  });

  test("generateManifestContent fails on duplicate markers", () => {
    const base = [
      "---",
      "tools:",
      ADV_TOOLS_BLOCK_START,
      "  adv_spec: true",
      ADV_TOOLS_BLOCK_END,
      ADV_TOOLS_BLOCK_START,
      "  adv_spec: true",
      ADV_TOOLS_BLOCK_END,
      "---",
    ].join("\n");
    expect(() => generateManifestContent(base, "determinus")).toThrow(
      /exactly one/i,
    );
  });

  test("generateManifestContent fails on incomplete marker pair", () => {
    const base = [
      "---",
      "tools:",
      ADV_TOOLS_BLOCK_START,
      "  adv_spec: true",
      "---",
    ].join("\n");
    expect(() => generateManifestContent(base, "determinus")).toThrow(
      /Incomplete marker pair/i,
    );
  });

  test("emitted block parses as valid YAML", () => {
    for (const policy of AGENT_TOOL_POLICY) {
      const block = generateAdvToolsBlock(policy.agent);
      assertValidAdvBlock(block);
    }
  });

  test("isLegacyManagedManifest gates on the sentinel pair", () => {
    expect(isLegacyManagedManifest(sentinelBase())).toBe(false);
    const managed = generateManifestContent(sentinelBase(), "determinus");
    expect(isLegacyManagedManifest(managed)).toBe(true);
  });

  test("runGenerate --check exits non-zero on injected drift", async () => {
    const agentsDir = createTempDir();
    try {
      const path = writeSentinelFixture(agentsDir);
      const drifted = readFileSync(path, "utf8").replace(
        "determinus_change_list: true",
        "determinus_change_list: false",
      );
      writeFileSync(path, drifted, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(false);
      expect(result.diffs.length).toBeGreaterThan(0);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check exits zero when no drift", async () => {
    const agentsDir = createTempDir();
    try {
      writeSentinelFixture(agentsDir);
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(true);
      expect(result.diffs).toEqual([]);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check tolerates hand-owned non-adv_* lines inside the generated region", async () => {
    const agentsDir = createTempDir();
    try {
      const path = writeSentinelFixture(agentsDir);
      const original = readFileSync(path, "utf8");
      const endMarker = original.indexOf(ADV_TOOLS_BLOCK_END);
      expect(endMarker).toBeGreaterThan(-1);
      const inserted = "  # Hand-owned non-adv_* line";
      const modified =
        original.slice(0, endMarker) +
        inserted +
        "\n" +
        original.slice(endMarker);
      writeFileSync(path, modified, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(true);
      expect(result.diffs).toEqual([]);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check exempts sentinel-free v2-native manifests", async () => {
    // v2-native manifests scope tools via permissions:, not the legacy tools:
    // map. The generator must leave them untouched in both modes.
    const agentsDir = createTempDir();
    try {
      const path = join(agentsDir, "determinus.md");
      const v2native = [
        "---",
        "name: determinus",
        "mode: primary",
        "permissions:",
        '  - action: "*"',
        "---",
        "",
        "body",
      ].join("\n");
      writeFileSync(path, v2native, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(true);
      expect(result.diffs).toEqual([]);
      expect(readFileSync(path, "utf8")).toBe(v2native);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check flags sentinel manifests without a policy row", async () => {
    const agentsDir = createTempDir();
    try {
      const base = [
        "---",
        "tools:",
        ADV_TOOLS_BLOCK_START,
        "  determinus_change_list: true",
        ADV_TOOLS_BLOCK_END,
        "---",
        "body",
      ].join("\n");
      writeFileSync(join(agentsDir, "ghost-agent.md"), base, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(false);
      expect(result.diffs.some((d) => d.includes("ghost-agent"))).toBe(true);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate write mode updates drifted files to committed output", async () => {
    const agentsDir = createTempDir();
    try {
      const path = writeSentinelFixture(agentsDir);
      const original = readFileSync(path, "utf8");
      const drifted = original.replace(
        "determinus_change_list: true",
        "determinus_change_list: false",
      );
      writeFileSync(path, drifted, "utf8");
      const result = await runGenerate({ check: false, agentsDir });
      expect(result.ok).toBe(true);
      const fixed = readFileSync(path, "utf8");
      expect(fixed).toBe(original);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });
});
