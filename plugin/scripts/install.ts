import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { parse } from "jsonc-parser";
import {
  installRelease,
  verifyRelease,
  rollbackInstalled,
} from "./installer-core";
const root = dirname(fileURLToPath(import.meta.url)),
  args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
try {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw Error("Node.js 24 or newer is required");
  const userRoot = resolve(value("--home") ?? homedir());
  if (args.includes("--rollback")) {
    console.log(JSON.stringify(rollbackInstalled(userRoot), null, 2));
    console.log("Restart OpenCode Beta to reload the restored configuration.");
  } else {
    if (process.env.OPENCODE_CONFIG_CONTENT) {
      const errors: any[] = [];
      const inline = parse(process.env.OPENCODE_CONFIG_CONTENT, errors, {
        allowTrailingComma: true,
      });
      if (errors.length)
        throw Error("OPENCODE_CONFIG_CONTENT contains invalid JSONC");
      if (
        inline?.plugins?.length ||
        inline?.plugin?.length ||
        inline?.compaction?.auto === false
      )
        throw Error(
          "OPENCODE_CONFIG_CONTENT overrides plugins or compaction. Move those settings into opencode.jsonc first. Credentials were not displayed or changed.",
        );
    }
    verifyRelease(root);
    const probe = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const x=await import(${JSON.stringify(pathToFileURL(resolve(root, "plugin/dist/index.js")).href)});if(x.default?.id!=='determinus'||typeof x.default.setup!=='function')process.exit(2);`,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    if (probe.status !== 0)
      throw Error(
        "Compiled bundle could not be imported: " +
          (probe.stderr || probe.error?.message),
      );
    const result = installRelease(root, userRoot, {
      dryRun: args.includes("--dry-run"),
      project: value("--project"),
      configDir: value("--config-dir") ?? process.env.OPENCODE_CONFIG_DIR,
      configFile: value("--config") ?? process.env.OPENCODE_CONFIG,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "installed")
      console.log(
        "DETERMINUS_INSTALL_OK — restart OpenCode Beta, then run validate-opencode2.ps1. Runtime traffic verification is still pending.",
      );
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
