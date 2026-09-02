import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { parse, modify, applyEdits, printParseErrorCode } from "jsonc-parser"

const [configPath, pluginPath] = process.argv.slice(2)
if (!configPath || !pluginPath) {
  throw new Error("Usage: node patch-opencode-config.mjs <opencode.json[c]> <plugin-path>")
}

let text = existsSync(configPath) ? readFileSync(configPath, "utf8") : "{}\n"
const errors = []
const config = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) ?? {}
if (errors.length > 0) {
  throw new Error(
    `OpenCode configuration is not valid JSONC: ${errors.map((item) => printParseErrorCode(item.error)).join(", ")}`,
  )
}

const normalize = (value) => String(value).replace(/\\/g, "/").toLowerCase()
const managedPlugin = (value) => {
  const path = normalize(value)
  return path.endsWith("/.local/share/advance/plugin") || path.endsWith("/.local/share/determinus/plugin")
}
const existingPlugins = Array.isArray(config.plugin) ? config.plugin : config.plugin ? [config.plugin] : []
const plugins = [...existingPlugins.filter((value) => !managedPlugin(value)), pluginPath]
  .filter((value, index, all) => all.findIndex((candidate) => normalize(candidate) === normalize(value)) === index)

const legacyInstruction = (value) => /(?:^|[/\\])(ADV_INSTRUCTIONS|cost-governance)\.md$/i.test(String(value))
const existingInstructions = Array.isArray(config.instructions)
  ? config.instructions
  : config.instructions
    ? [config.instructions]
    : []
const instructions = existingInstructions.filter((value) => !legacyInstruction(value))
const options = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } }

text = applyEdits(text, modify(text, ["plugin"], plugins, options))
text = applyEdits(text, modify(text, ["instructions"], instructions, options))
writeFileSync(configPath, text.endsWith("\n") ? text : text + "\n", "utf8")
