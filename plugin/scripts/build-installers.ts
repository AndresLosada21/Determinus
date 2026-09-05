import { build } from "tsup";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  config: false,
  entry: {
    install: resolve(plugin, "scripts/install.ts"),
    validate: resolve(plugin, "scripts/validate.ts"),
  },
  outDir: resolve(plugin, ".."),
  format: ["esm"],
  target: "node24",
  splitting: false,
  dts: false,
  clean: false,
  noExternal: [/.*/],
  outExtension: () => ({ js: ".mjs" }),
});
