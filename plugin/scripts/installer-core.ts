import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { parse, modify, applyEdits, printParseErrorCode } from "jsonc-parser";
const sha = (x: Buffer | string) =>
  createHash("sha256").update(x).digest("hex");
const normalize = (x: string) =>
  x
    .replace(/\\/g, "/")
    .replace(/^file:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
export function managedPlugin(value: unknown) {
  const item =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "package" in value
        ? (value as any).package
        : "";
  if (typeof item !== "string") return false;
  const name = normalize(item);
  return (
    /^(?:@andreslosada21\/)?(?:determinus|advance)(?:@[^/]+)?$/.test(name) ||
    /(?:^|\/)(?:determinus(?:-[^/]*)?|advance(?:-[^/]*)?|advance-opencode2)(?:\/|$)/.test(
      name,
    )
  );
}
export function patchConfig(text: string, entry: string) {
  const errors: any[] = [];
  const config =
    parse(text.replace(/^\uFEFF/, ""), errors, { allowTrailingComma: true }) ??
    {};
  if (
    errors.length ||
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  )
    throw Error(
      "Invalid OpenCode JSONC: " +
        errors.map((e) => printParseErrorCode(e.error)).join(", "),
    );
  let result = text.replace(/^\uFEFF/, "");
  const opts = {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  };
  if (config.plugin !== undefined) {
    const items = Array.isArray(config.plugin)
      ? config.plugin
      : [config.plugin];
    const remaining = items.filter((x: unknown) => !managedPlugin(x));
    result = applyEdits(
      result,
      modify(
        result,
        ["plugin"],
        remaining.length ? remaining : undefined,
        opts,
      ),
    );
  }
  if (config.plugins !== undefined && !Array.isArray(config.plugins))
    throw Error("OpenCode plugins must be an array");
  const entries = (config.plugins ?? []).filter(
    (x: unknown) =>
      !managedPlugin(x) &&
      !(typeof x === "string" && normalize(x) === normalize(entry)),
  );
  result = applyEdits(
    result,
    modify(result, ["plugins"], [...entries, entry.replace(/\\/g, "/")], opts),
  );
  if (
    config.compaction?.auto === false ||
    config.compaction?.auto === undefined
  )
    result = applyEdits(
      result,
      modify(result, ["compaction", "auto"], true, opts),
    );
  if (config.instructions !== undefined) {
    const items = Array.isArray(config.instructions)
      ? config.instructions
      : [config.instructions];
    const remaining = items.filter(
      (x: unknown) =>
        typeof x !== "string" || !/(?:^|[/\\])ADV_INSTRUCTIONS\.md$/i.test(x),
    );
    if (items.length !== remaining.length)
      result = applyEdits(
        result,
        modify(result, ["instructions"], remaining, opts),
      );
  }
  return result.endsWith("\n") ? result : result + "\n";
}
export function verifyRelease(root: string) {
  const manifest = JSON.parse(
    readFileSync(join(root, "release-manifest.json"), "utf8"),
  );
  if (
    manifest.version !== "3.0.4" ||
    !manifest.files ||
    typeof manifest.files !== "object"
  )
    throw Error("Unsupported release manifest");
  for (const [name, hash] of Object.entries(manifest.files)) {
    const file = resolve(root, name),
      rel = relative(root, file);
    if (
      isAbsolute(name) ||
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      !existsSync(file) ||
      lstatSync(file).isSymbolicLink()
    )
      throw Error("Unsafe or missing release file: " + name);
    if (sha(readFileSync(file)) !== hash)
      throw Error("Release checksum mismatch: " + name);
  }
  const bundle = JSON.parse(
    readFileSync(join(root, "plugin/dist/plugin-bundle-manifest.json"), "utf8"),
  );
  for (const [name, hash] of Object.entries(bundle.files)) {
    if (
      !/^[a-z-]+$/.test(name) ||
      sha(readFileSync(join(root, "plugin/dist", name + ".js"))) !== hash
    )
      throw Error("Bundle checksum mismatch");
  }
  return {
    manifest,
    bundle,
    identity: sha(readFileSync(join(root, "release-manifest.json"))).slice(
      0,
      16,
    ),
  };
}
type Write = { file: string; before: string | null; after: string };
type Move = { from: string; to: string };
type Journal = {
  status: "pending" | "committed" | "rolled-back";
  writes: Write[];
  moves: Move[];
};
const encode = (file: string) =>
  existsSync(file) ? readFileSync(file).toString("base64") : null;
function atomic(file: string, body: Buffer | string) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + ".tmp-" + randomBytes(6).toString("hex");
  writeFileSync(temp, body, { mode: 0o600 });
  renameSync(temp, file);
}
function rollback(j: Journal, path: string) {
  // Preflight all conflicts before restoring any file. Interrupted restoration
  // remains resumable because already restored files equal their before value.
  for (const w of j.writes) {
    const current = encode(w.file);
    if (current !== w.before && current !== w.after)
      throw Error("Rollback preserved a concurrently edited file: " + w.file);
  }
  for (const m of j.moves)
    if (existsSync(m.to) && existsSync(m.from))
      throw Error("Rollback conflict: " + m.from);
  for (const w of [...j.writes].reverse()) {
    if (encode(w.file) === w.before) continue;
    if (w.before === null) rmSync(w.file, { force: true });
    else atomic(w.file, Buffer.from(w.before, "base64"));
  }
  for (const m of [...j.moves].reverse()) {
    if (!existsSync(m.to)) continue;
    mkdirSync(dirname(m.from), { recursive: true });
    renameSync(m.to, m.from);
  }
  j.status = "rolled-back";
  atomic(path, JSON.stringify(j, null, 2));
}
export function installRelease(
  root: string,
  home: string,
  options: {
    dryRun?: boolean;
    project?: string;
    configDir?: string;
    configFile?: string;
    failAfterWrites?: number;
  } = {},
) {
  const { manifest, bundle, identity } = verifyRelease(root),
    deploy = join(home, ".local/share/Determinus"),
    target = join(deploy, "releases", `${manifest.version}-${identity}`),
    entry = join(target, "plugin/index.ts");
  const globalConfig = options.configDir
    ? resolve(options.configDir)
    : join(home, ".config/opencode");
  const discoveryDirs = [
    globalConfig,
    ...(options.project ? [join(resolve(options.project), ".opencode")] : []),
  ];
  const configDirs = [
    ...new Set([
      globalConfig,
      ...(options.project
        ? [resolve(options.project), ...discoveryDirs.slice(1)]
        : []),
    ]),
  ];
  const configs = [
    ...new Set([
      ...configDirs.flatMap((dir, i) => {
        const found = [
          join(dir, "opencode.jsonc"),
          join(dir, "opencode.json"),
        ].filter(existsSync);
        return found.length
          ? found
          : i === 0
            ? [join(dir, "opencode.jsonc")]
            : [];
      }),
      ...(options.configFile ? [resolve(options.configFile)] : []),
    ]),
  ];
  const writes: Write[] = configs.map((file) => ({
    file,
    before: encode(file),
    after: Buffer.from(
      patchConfig(
        existsSync(file) ? readFileSync(file, "utf8") : "{}\n",
        entry,
      ),
    ).toString("base64"),
  }));
  const agent = join(globalConfig, "agents/determinus.md");
  writes.push({
    file: agent,
    before: encode(agent),
    after: readFileSync(join(root, ".opencode/agents/determinus.md")).toString(
      "base64",
    ),
  });
  if (options.dryRun)
    return { status: "plan", target, configs, version: manifest.version };
  mkdirSync(deploy, { recursive: true, mode: 0o700 });
  const lock = join(deploy, "install.lock");
  if (existsSync(lock)) {
    const previous = JSON.parse(readFileSync(lock, "utf8"));
    let alive = false;
    try {
      process.kill(previous.pid, 0);
      alive = true;
    } catch {}
    if (alive) throw Error("Another Determinus installer is running");
    if (previous.journal && existsSync(previous.journal)) {
      const pending = JSON.parse(readFileSync(previous.journal, "utf8"));
      if (pending.status === "pending") rollback(pending, previous.journal);
    }
    rmSync(lock);
    return installRelease(root, home, options);
  }
  const backup = join(
      deploy,
      "backups",
      new Date().toISOString().replace(/[:.]/g, "-") +
        "-" +
        randomBytes(4).toString("hex"),
    ),
    journalPath = join(backup, "transaction.json");
  writeFileSync(
    lock,
    JSON.stringify({ pid: process.pid, journal: journalPath }),
    { flag: "wx", mode: 0o600 },
  );
  const journal: Journal = { status: "pending", writes, moves: [] },
    stage = target + ".stage-" + process.pid;
  try {
    if (!existsSync(target)) {
      mkdirSync(dirname(stage), { recursive: true });
      for (const name of Object.keys(manifest.files)) {
        const dest = join(stage, name);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(join(root, name)));
      }
      writeFileSync(
        join(stage, "release-manifest.json"),
        readFileSync(join(root, "release-manifest.json")),
      );
      verifyRelease(stage);
      renameSync(stage, target);
    } else verifyRelease(target);
    // Only actual OpenCode configuration discovery directories are retired.
    // Project-root plugins/ may be source code and is never touched here.
    for (const dir of new Set(discoveryDirs)) {
      for (const name of [
        "determinus.ts",
        "determinus.js",
        "determinus",
        "advance.ts",
        "advance.js",
        "advance",
        "adv.ts",
        "adv.js",
      ]) {
        const from = join(dir, "plugins", name);
        if (existsSync(from))
          journal.moves.push({
            from,
            to: join(backup, "discovery", String(journal.moves.length), name),
          });
      }
      for (const sub of ["agents", "agent", "skills", "command", "commands"]) {
        const folder = join(dir, sub);
        if (!existsSync(folder)) continue;
        for (const name of readdirSync(folder)) {
          if (
            !/^(?:adv|advance)(?:\.md)?$/i.test(name) &&
            !/^determinus-.+/i.test(name) &&
            !(sub === "skills" && name === "determinus")
          )
            continue;
          const from = join(folder, name);
          journal.moves.push({
            from,
            to: join(
              backup,
              "retired-assets",
              String(journal.moves.length),
              name,
            ),
          });
        }
      }
    }
    const receipt = join(deploy, "installed.json");
    writes.push({
      file: receipt,
      before: encode(receipt),
      after: Buffer.from(
        JSON.stringify(
          {
            version: manifest.version,
            target,
            entry,
            identity,
            generation: bundle.generation,
            installedAt: new Date().toISOString(),
            backup,
          },
          null,
          2,
        ),
      ).toString("base64"),
    });
    atomic(journalPath, JSON.stringify(journal, null, 2));
    for (const move of journal.moves) {
      mkdirSync(dirname(move.to), { recursive: true });
      renameSync(move.from, move.to);
    }
    let count = 0;
    for (const w of writes) {
      if (encode(w.file) !== w.before)
        throw Error("Configuration changed during installation: " + w.file);
      atomic(w.file, Buffer.from(w.after, "base64"));
      if (options.failAfterWrites === ++count)
        throw Error("Injected installation fault");
    }
    journal.status = "committed";
    atomic(journalPath, JSON.stringify(journal, null, 2));
    return {
      status: "installed",
      version: manifest.version,
      target,
      configs,
      backup,
    };
  } catch (error) {
    if (existsSync(journalPath) && journal.status === "pending")
      rollback(journal, journalPath);
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
    if (journal.status !== "pending" || !existsSync(journalPath))
      rmSync(lock, { force: true });
  }
}
export function rollbackInstalled(home: string) {
  const deploy = join(home, ".local/share/Determinus"),
    lock = join(deploy, "install.lock");
  const receipt = JSON.parse(
      readFileSync(join(deploy, "installed.json"), "utf8"),
    ),
    path = join(receipt.backup, "transaction.json"),
    journal: Journal = JSON.parse(readFileSync(path, "utf8"));
  if (journal.status !== "committed")
    throw Error(
      "The last installation is not committed; rerun the installer to recover it",
    );
  writeFileSync(lock, JSON.stringify({ pid: process.pid, journal: path }), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    journal.status = "pending";
    atomic(path, JSON.stringify(journal, null, 2));
    rollback(journal, path);
    return { status: "rolled-back", backup: receipt.backup };
  } finally {
    if (journal.status !== "pending") rmSync(lock, { force: true });
  }
}
