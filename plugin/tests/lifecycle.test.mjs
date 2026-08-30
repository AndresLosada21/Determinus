import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

async function copyTree(src, dst) {
  await fs.cp(src, dst, { recursive: true })
}

async function fixture() {
  const pluginDir = path.resolve(new URL("..", import.meta.url).pathname)
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ade-v520-lifecycle-"))
  const runtime = path.join(temp, "plugin")
  await fs.mkdir(path.join(runtime, "src"), { recursive: true })
  await fs.copyFile(path.join(pluginDir, "src", "index.ts"), path.join(runtime, "src", "index.ts"))
  await fs.copyFile(path.join(pluginDir, "capabilities.json"), path.join(runtime, "capabilities.json"))
  await copyTree(path.join(pluginDir, "assets"), path.join(runtime, "assets"))
  await copyTree(path.join(pluginDir, "compat-runtime"), path.join(runtime, "compat-runtime"))

  // Official V2 local plugins import the host SDK. The lifecycle test supplies only
  // Plugin.define so the source can execute without installing OpenCode itself.
  const sdk = path.join(runtime, "node_modules", "@opencode-ai", "plugin")
  await fs.mkdir(sdk, { recursive: true })
  await fs.writeFile(path.join(sdk, "package.json"), JSON.stringify({
    name: "@opencode-ai/plugin", type: "module", exports: "./index.js"
  }), "utf8")
  await fs.writeFile(path.join(sdk, "index.js"), "export const Plugin={define:(value)=>value}\n", "utf8")

  const project = path.join(temp, "project")
  await fs.mkdir(path.join(project, ".ai"), { recursive: true })
  await fs.writeFile(path.join(project, ".ai", "control.json"), JSON.stringify({
    schema_version: 2,
    work_item_id: "LIFECYCLE",
    revision: 0,
    global_status: "NOT_DONE",
    product: { required: false, status: "DRAFT", revision: 0 },
    delivery: { required: false, status: "DRAFT", revision: 0 },
    engineering: { required: true, status: "DISCOVERING", revision: 0 },
    evidence: {}, notes: [],
    work_management: { provider: "none", sync_status: "NOT_CONFIGURED", last_sync_at: "", external_refs: [] },
    traceability: { file: ".ai/traceability.json" },
    audit: { file: ".ai/audit.jsonl" }
  }, null, 2) + "\n", "utf8")
  return { temp, runtime, project }
}

function makeContext(project, cap) {
  const hooks = {}
  const tools = new Map()
  const commands = new Map()
  const vcsCalls = []
  const agentRecords = Object.keys(cap.agents).map(id => ({ id, description: id }))
  let defaultAgent

  const locationInfo = {
    directory: project,
    project: { id: "project_lifecycle", directory: project, canonical: project }
  }

  const ctx = {
    app: { version: "0.0.0-beta-test" },
    // Deliberately wrong for the active session. The plugin must NOT use this as project root.
    location: { directory: path.join(project, "..", "plugin-instance"), project: { id: "host", directory: path.join(project, ".."), canonical: path.join(project, "..") } },
    storage: { async set() {}, async get() { return undefined }, async remove() {}, async scan() { return { entries: [] } } },
    agent: {
      async transform(cb) {
        const draft = {
          get(id) { return agentRecords.find(x => x.id === id) },
          list() { return agentRecords },
          default(id) { defaultAgent = id },
          update(id, fn) { const item = agentRecords.find(x => x.id === id); if (item) fn(item) },
          remove() {},
        }
        cb(draft)
      },
      async list(input) { return { location: locationInfo, data: agentRecords, input } },
    },
    skill: { async list() { return { location: locationInfo, data: [{ id: "ai-driven-engineering" }] } } },
    plugin: { async list() { return { location: locationInfo, data: [{ id: "ai-driven-engineering.native" }] } } },
    session: {
      async get({ sessionID }) { return { id: sessionID, location: { directory: project } } },
      async hook(name, cb) { hooks[`session:${name}`] = cb },
      async synthetic() {}, async prompt() {}, async switchAgent() {},
    },
    permission: { async hook(name, cb) { hooks[`permission:${name}`] = cb } },
    tool: {
      async transform(cb) {
        cb({
          add(def) {
            const ns = def.options?.namespace ? `${def.options.namespace}_` : ""
            tools.set(`${ns}${def.name}`, def)
          },
          list() { return [...tools.values()] }, get(id) { return tools.get(id) }, update() {}, remove(id) { tools.delete(id) }
        })
      }
    },
    command: { async transform(cb) { cb({ add(def) { commands.set(def.name, def) } }) } },
    vcs: {
      async get(input) { vcsCalls.push(["get", input]); return { location: locationInfo, data: { branch: { current: "feature", default: "main" } } } },
      async status(input) { vcsCalls.push(["status", input]); return { location: locationInfo, data: [{ file: "a.txt", additions: 1, deletions: 0, status: "modified" }] } },
      async branches(input) { vcsCalls.push(["branches", input]); return { location: locationInfo, data: ["feature", "main"] } },
      async diff(input) { vcsCalls.push(["diff", input]); return { location: locationInfo, data: [{ file: "a.txt", patch: "+x", additions: 1, deletions: 0, status: "modified" }] } },
    },
    integration: { connection: { async active() { return undefined }, async resolve() { return undefined } } },
  }
  return { ctx, hooks, tools, commands, vcsCalls, get defaultAgent() { return defaultAgent } }
}

test("OpenCode V2-shaped lifecycle registers and executes session-scoped native capabilities", async () => {
  const fx = await fixture()
  try {
    const cap = JSON.parse(await fs.readFile(path.join(fx.runtime, "capabilities.json"), "utf8"))
    const state = makeContext(fx.project, cap)
    const url = `${pathToFileURL(path.join(fx.runtime, "src", "index.ts")).href}?v=${Date.now()}`
    const mod = await import(url)
    assert.equal(mod.default.id, "ai-driven-engineering.native")
    const cleanup = await mod.default.setup(state.ctx)

    assert.equal(state.defaultAgent, "orchestrator")
    assert.equal(state.tools.size, 25)
    assert.equal(state.commands.size, 8)

    const contextHook = state.hooks["session:context"]
    assert.equal(typeof contextHook, "function")
    const system = [{ type: "text", text: "original" }]
    const allTools = Object.fromEntries([...state.tools.keys()].map(name => [name, { description: name, input: {} }]))
    allTools.shell = { description: "shell", input: {} }
    allTools.execute = { description: "execute", input: {} }
    const event = { sessionID: "ses_lifecycle", agent: "explorer", model: { providerID: "x", modelID: "y" }, system, messages: [], tools: allTools, generation: {}, providerOptions: {} }
    await contextHook(event)
    assert.deepEqual(event.system, [{ type: "text", text: "original" }])
    const expectedExplorer = new Set(cap.agents.explorer)
    assert.deepEqual(new Set(Object.keys(event.tools)), expectedExplorer)
    assert.equal(event.generation.maxTokens, cap.generation_max_tokens.explorer)

    const permissionHook = state.hooks["permission:evaluate"]
    const denied = { sessionID: "ses_lifecycle", agent: "explorer", action: "ade_tracker_read", resources: [], effect: "allow" }
    await permissionHook(denied)
    assert.equal(denied.effect, "deny")

    const retryHook = state.hooks["session:retry"]
    assert.equal(typeof retryHook, "function")
    const retryEvent = { error: { type: "provider.invalid-request", message: 'only "auto" is supported for tool_choice' }, attempt: 1, decision: { retry: false } }
    await retryHook(retryEvent)
    assert.deepEqual(retryEvent.decision, { retry: true, delay: 400 })
    const terminalRetry = { error: { type: "provider.invalid-request", message: 'only "auto" is supported for tool_choice' }, attempt: 3, decision: { retry: true } }
    await retryHook(terminalRetry)
    assert.deepEqual(terminalRetry.decision, { retry: false })

    const orchestratorContext = { sessionID: "ses_lifecycle", agent: "orchestrator", messageID: "msg", id: "call-status", async progress() {} }
    const status = await state.tools.get("ade_status").execute({}, orchestratorContext)
    const statusValue = JSON.parse(status.content)
    assert.equal(path.resolve(statusValue.project_root), path.resolve(fx.project))
    assert.equal(statusValue.plugin.version, "5.2.0")

    const evidenceContext = { sessionID: "ses_lifecycle", agent: "explorer", messageID: "msg", id: "call-evidence", async progress() {} }
    const evidence = await state.tools.get("ade_evidence_record").execute({ plane: "engineering", state: "OBSERVADO", summary: "legacy evidence shape migration" }, evidenceContext)
    const evidenceValue = JSON.parse(evidence.content)
    assert.equal(evidenceValue.state, "OBSERVADO")
    const persisted = JSON.parse(await fs.readFile(path.join(fx.project, ".ai", "control.json"), "utf8"))
    assert.ok(Array.isArray(persisted.evidence))
    assert.equal(persisted.evidence_count, 1)
    const evidenceLog = await fs.readFile(path.join(fx.project, ".ai", "evidence.jsonl"), "utf8")
    assert.match(evidenceLog, /legacy evidence shape migration/)

    const explorerContext = { sessionID: "ses_lifecycle", agent: "explorer", messageID: "msg", id: "call-vcs", async progress() {} }
    const vcs = await state.tools.get("ade_vcs_status").execute({}, explorerContext)
    const vcsValue = JSON.parse(vcs.content)
    assert.equal(vcsValue.status, "OBSERVADO")
    const statusCall = state.vcsCalls.find(([name]) => name === "status")
    assert.deepEqual(statusCall[1], { location: { directory: path.resolve(fx.project) } })

    if (typeof cleanup === "function") await cleanup()
  } finally {
    await fs.rm(fx.temp, { recursive: true, force: true })
  }
})
