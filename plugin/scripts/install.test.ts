import { it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "jsonc-parser";
import {
  patchConfig,
  installRelease,
  verifyRelease,
  rollbackInstalled,
  managedPlugin,
} from "./installer-core";
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "determinus-install-")),
    root = join(base, "release"),
    home = join(base, "home");
  const files: Record<string, string> = {
    "plugin/dist/index.js": "export default {id:'determinus',setup(){}};",
    "plugin/index.ts": "export {default} from './dist/index.js';",
    ".opencode/agents/determinus.md": "New agent",
  };
  files["plugin/dist/plugin-bundle-manifest.json"] = JSON.stringify({
    generation: "test",
    files: { index: sha(files["plugin/dist/index.js"]) },
  });
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  writeFileSync(
    join(root, "release-manifest.json"),
    JSON.stringify({
      version: "3.0.4",
      files: Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, sha(v)]),
      ),
    }),
  );
  mkdirSync(join(home, ".config/opencode/agents"), { recursive: true });
  return {
    base,
    root,
    home,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}
it("preserves JSONC comments, credentials and unrelated plugins; updates idempotently", () => {
  const raw =
    '// keep comment\n{"provider":{"my":{"options":{"apiKey":"fixture-secret"}}},"plugins":["other-plugin",{"package":"@andreslosada21/determinus@3.0.1"}],"plugin":["C:/Users/carlos/.local/share/Determinus/plugin"],}';
  const text = patchConfig(raw, "C:/Users/carlos/new/plugin/index.ts"),
    c = parse(text);
  expect(c.plugins).toEqual([
    "other-plugin",
    "C:/Users/carlos/new/plugin/index.ts",
  ]);
  expect(c.provider.my.options.apiKey).toBe("fixture-secret");
  expect(c.plugin).toBeUndefined();
  expect(text).toContain("// keep comment");
  expect(patchConfig(text, "C:/Users/carlos/new/plugin/index.ts")).toBe(text);
});
it("rejects invalid config and tampering before mutation", () => {
  const f = fixture();
  try {
    const c = join(f.home, ".config/opencode/opencode.jsonc");
    writeFileSync(c, '{"broken":');
    expect(() => installRelease(f.root, f.home)).toThrow("JSONC");
    expect(readFileSync(c, "utf8")).toBe('{"broken":');
    writeFileSync(join(f.root, "plugin/dist/index.js"), "tampered");
    expect(() => verifyRelease(f.root)).toThrow("checksum");
  } finally {
    f.cleanup();
  }
});
it("registers the plugin directory, never a file (host rejects file paths)", () => {
  const f = fixture();
  try {
    installRelease(f.root, f.home);
    const configPath = join(f.home, ".config/opencode/opencode.jsonc");
    const plugins = parse(readFileSync(configPath, "utf8")).plugins as string[];
    expect(plugins).toHaveLength(1);
    expect(plugins[0].endsWith("/plugin")).toBe(true);
    expect(plugins[0].endsWith("index.ts")).toBe(false);
    const receipt = JSON.parse(
      readFileSync(
        join(f.home, ".local/share/Determinus/installed.json"),
        "utf8",
      ),
    );
    // Receipt keeps the native path; config stores forward slashes.
    expect(receipt.entry.replace(/\\/g, "/")).toBe(plugins[0]);
  } finally {
    f.cleanup();
  }
});
it("prunes stale and mangled Determinus entries, keeps the new directory entry", () => {
  const raw =
    '{"plugins":["other-plugin","asC:/Users/carlos/.local/share/Determinus/releases/3.0.4-old/plugin","C:/Users/carlos/.local/share/Determinus/plugin","C:/Users/carlos/new/plugin/index.ts"]}';
  expect(
    managedPlugin(
      "asC:/Users/carlos/.local/share/Determinus/releases/3.0.4-old/plugin",
    ),
  ).toBe(true);
  const text = patchConfig(raw, "C:/Users/carlos/new/plugin"),
    c = parse(text);
  expect(c.plugins).toEqual([
    "other-plugin",
    "C:/Users/carlos/new/plugin/index.ts",
    "C:/Users/carlos/new/plugin",
  ]);
});
it("rolls back config, agent and discovery on a fault", () => {
  const f = fixture();
  try {
    const c = join(f.home, ".config/opencode/opencode.jsonc"),
      agent = join(f.home, ".config/opencode/agents/determinus.md"),
      legacy = join(f.home, ".config/opencode/plugins/determinus.js");
    writeFileSync(c, '{"plugins":["other"]}');
    writeFileSync(agent, "Old agent");
    mkdirSync(join(legacy, ".."), { recursive: true });
    writeFileSync(legacy, "old");
    expect(() =>
      installRelease(f.root, f.home, { failAfterWrites: 2 }),
    ).toThrow("Injected");
    expect(readFileSync(c, "utf8")).toBe('{"plugins":["other"]}');
    expect(readFileSync(agent, "utf8")).toBe("Old agent");
    expect(readFileSync(legacy, "utf8")).toBe("old");
  } finally {
    f.cleanup();
  }
});
it("installs twice and preserves session data and project source", () => {
  const f = fixture();
  try {
    const state = join(
      f.home,
      ".local/share/opencode/plugins/determinus/session.json",
    );
    mkdirSync(join(state, ".."), { recursive: true });
    writeFileSync(state, '{"durable":true}');
    const project = join(f.base, "project");
    mkdirSync(project);
    writeFileSync(join(project, "opencode.json"), '{"plugins":["determinus"]}');
    const src = join(project, "plugins/determinus/source.ts");
    mkdirSync(join(src, ".."), { recursive: true });
    writeFileSync(src, "User source");
    const a = installRelease(f.root, f.home, { project }),
      b = installRelease(f.root, f.home, { project });
    expect(a.target).toBe(b.target);
    expect(existsSync(join(a.target, "plugin/dist/index.js"))).toBe(true);
    expect(
      parse(readFileSync(join(project, "opencode.json"), "utf8")).plugins
        .length,
    ).toBe(1);
    expect(readFileSync(state, "utf8")).toBe('{"durable":true}');
    expect(readFileSync(src, "utf8")).toBe("User source");
  } finally {
    f.cleanup();
  }
});
it("recovers an interrupted journal and undoes committed installation", () => {
  const f = fixture();
  try {
    const c = join(f.home, ".config/opencode/opencode.jsonc"),
      original = '{"plugins":["other"]}';
    writeFileSync(c, original);
    const first = installRelease(f.root, f.home),
      path = join(first.backup!, "transaction.json"),
      j = JSON.parse(readFileSync(path, "utf8"));
    j.status = "pending";
    writeFileSync(path, JSON.stringify(j));
    writeFileSync(
      join(f.home, ".local/share/Determinus/install.lock"),
      JSON.stringify({ pid: 2147483647, journal: path }),
    );
    installRelease(f.root, f.home);
    expect(JSON.parse(readFileSync(path, "utf8")).status).toBe("rolled-back");
    rollbackInstalled(f.home);
    expect(readFileSync(c, "utf8")).toBe(original);
    expect(
      existsSync(join(f.home, ".local/share/Determinus/installed.json")),
    ).toBe(false);
  } finally {
    f.cleanup();
  }
});
it("protects concurrent edits during rollback", () => {
  const f = fixture();
  try {
    const installed = installRelease(f.root, f.home),
      c = join(f.home, ".config/opencode/opencode.jsonc");
    writeFileSync(c, '{"newUserSetting":true}');
    expect(() => rollbackInstalled(f.home)).toThrow("concurrently edited");
    expect(readFileSync(c, "utf8")).toBe('{"newUserSetting":true}');
    expect(
      JSON.parse(
        readFileSync(join(installed.backup!, "transaction.json"), "utf8"),
      ).status,
    ).toBe("pending");
  } finally {
    f.cleanup();
  }
});
it("honors custom config paths and retires only owned assets", () => {
  const f = fixture();
  try {
    const configDir = join(f.base, "custom");
    mkdirSync(join(configDir, "agents"), { recursive: true });
    writeFileSync(join(configDir, "agents/adv.md"), "old");
    const configFile = join(f.base, "specific.jsonc");
    writeFileSync(
      configFile,
      '{"instructions":["C:/legacy/ADV_INSTRUCTIONS.md","AGENTS.md","cost-governance.md"]}',
    );
    const r = installRelease(f.root, f.home, { configDir, configFile });
    expect(parse(readFileSync(configFile, "utf8")).instructions).toEqual([
      "AGENTS.md",
      "cost-governance.md",
    ]);
    expect(existsSync(join(configDir, "agents/adv.md"))).toBe(false);
    expect(existsSync(join(configDir, "agents/determinus.md"))).toBe(true);
    expect(r.configs).toContain(configFile);
  } finally {
    f.cleanup();
  }
});
