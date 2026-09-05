import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyRelease } from "./installer-core";
const args = process.argv.slice(2),
  get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
try {
  const root = join(
      resolve(get("--home") ?? homedir()),
      ".local/share/Determinus",
    ),
    receipt = JSON.parse(readFileSync(join(root, "installed.json"), "utf8"));
  verifyRelease(receipt.target);
  const dir = join(root, "diagnostics"),
    files = existsSync(dir)
      ? readdirSync(dir).filter((x) => /^cache-.+\.json$/.test(x))
      : [];
  const reports = files.flatMap((name) => {
    try {
      const r = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (
        r.version !== "3.0.4" ||
        r.generation !== receipt.generation ||
        !r.active ||
        Date.parse(r.startedAt) < Date.parse(receipt.installedAt)
      )
        return [];
      try {
        process.kill(r.pid, 0);
      } catch {
        return [];
      }
      return [r];
    } catch {
      return [];
    }
  });
  const cli = spawnSync(
    get("--cli") ??
      (process.platform === "win32" ? "opencode2.exe" : "opencode2"),
    ["api", "get", "/api/plugin"],
    {
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const states: any[] = [];
  const walk = (x: any) => {
    if (!x || typeof x !== "object") return;
    if (x.id === "determinus" && x.state) states.push(x);
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
  };
  try {
    walk(JSON.parse(cli.stdout));
  } catch {}
  const canonical = (x: string) => x.replace(/\\/g, "/").toLowerCase();
  const entryRoot = canonical(receipt.entry);
  const active = states.some(
    (x) =>
      x.state.status === "active" &&
      typeof x.source?.path === "string" &&
      (canonical(x.source.path) === entryRoot ||
        canonical(x.source.path).startsWith(entryRoot + "/")),
  );
  const services = ["go", "zen"].map((service) => {
    const samples = reports
        .flatMap((r) => r.samples ?? [])
        .filter((x) => x.service === service),
      valid = samples.filter(
        (x) =>
          x.sessionPresent &&
          x.userAgentPresent &&
          x.status >= 200 &&
          x.status < 300,
      );
    const groups = new Map<string, number>();
    for (const x of valid)
      if (
        x.identitySource !== "standalone-operation" &&
        typeof x.sessionHash === "string"
      )
        groups.set(x.sessionHash, (groups.get(x.sessionHash) ?? 0) + 1);
    return {
      service,
      observed: samples.length,
      valid2xx: valid.length,
      repeatedSession: [...groups.values()].some((x) => x >= 2),
      standalone: valid.filter(
        (x) => x.identitySource === "standalone-operation",
      ).length,
      usageSteps: reports.reduce(
        (n, r) => n + (r.usageByService?.[service]?.steps ?? 0),
        0,
      ),
      cacheReadTokens: reports.reduce(
        (n, r) => n + (r.usageByService?.[service]?.cacheReadTokens ?? 0),
        0,
      ),
    };
  });
  const required = (get("--require") ?? "go").split(",");
  if (required.some((x) => !["go", "zen"].includes(x)))
    throw Error("--require accepts go, zen or go,zen");
  const traffic = required.every((service) => {
    const s = services.find((x) => x.service === service);
    return s && s.repeatedSession && s.usageSteps >= 2 && s.cacheReadTokens > 0;
  });
  const passed = active && reports.length > 0 && traffic;
  console.log(
    JSON.stringify(
      {
        version: receipt.version,
        installIntegrity: "verified",
        pluginState: active ? "active" : "not-confirmed",
        cliExitCode: cli.status,
        cliError: (cli.error as NodeJS.ErrnoException | undefined)?.code,
        currentRuntimeReports: reports.length,
        services,
        usageSteps: reports.reduce((n, r) => n + (r.usageSteps ?? 0), 0),
        cacheReadTokens: reports.reduce(
          (n, r) => n + (r.cacheReadTokens ?? 0),
          0,
        ),
        result: passed
          ? "DETERMINUS_RUNTIME_AND_CACHE_OBSERVED"
          : "DETERMINUS_VALIDATION_PENDING",
        note: "Observed traffic applies to this loaded generation, not all future requests or calls bypassing the catalog.",
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 2;
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
