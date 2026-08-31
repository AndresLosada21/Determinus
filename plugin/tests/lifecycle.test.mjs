import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { pathToFileURL, fileURLToPath } from "node:url"

async function copyTree(src, dst) {
  await fs.cp(src, dst, { recursive: true })
}

async function fixture({ legacySdk = false } = {}) {
  const pluginDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
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
  await fs.writeFile(path.join(sdk, "index.js"), legacySdk
    ? "export const tool={}\n"
    : "export const Plugin={define:(value)=>value}\n", "utf8")

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
  await fs.writeFile(path.join(project, ".ai", "tracker-policy.json"), JSON.stringify({ schema_version: 1, read: { authorized: true }, write: { authorized: true }, remote: { allowed_https_hosts: ["api.github.com", "api.linear.app"], allowed_github_repositories: ["octo/repo"], allowed_github_projects: ["octo/4"], allowed_jira_projects: [], allowed_linear_team_ids: [] } }, null, 2) + "\n", "utf8")
  await fs.writeFile(path.join(project, ".ai", "integrations.json"), JSON.stringify({ schema_version: 1, work_management: { provider: "github", github: { owner: "octo", repository: "repo", project_owner: "octo", project_number: 4, connection_id: "github" } } }, null, 2) + "\n", "utf8")
  return { temp, runtime, project }
}
function grantsRootDir() {
  const home = os.homedir()
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    return path.join(base, "opencode", "ade-grants")
  }
  const base = process.env.XDG_STATE_HOME || path.join(home, ".local", "state")
  return path.join(base, "opencode", "ade-grants")
}
function canonicalStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]"
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort()
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalStringify(value[k])).join(",") + "}"
  }
  return JSON.stringify(value)
}
function hashResource(obj) { return crypto.createHash("sha256").update(canonicalStringify(obj)).digest("hex") }
async function projectHashForRoot(root) { const real = await fs.realpath(root); return crypto.createHash("sha256").update(real).digest("hex") }
function resourceFingerprintFor(tool,input,extra={}){
  let obj={tool}
  if(tool==="ade_tracker_project_sync"){
    const updates=Array.isArray(input.updates)?input.updates:[]
    const norm=updates.map(u=>({external_id:String(u.external_id||""),item_id:String(u.item_id||""),fields:Array.isArray(u.fields)?[...u.fields].map(f=>({name:String(f.name||""),value:String(f.value??"")})).sort((a,b)=>a.name.localeCompare(b.name)):[]})).sort((a,b)=>(a.external_id+"|"+a.item_id).localeCompare(b.external_id+"|"+b.item_id))
    obj={tool,target:extra.target||null,updates:norm}
  }else if(tool==="ade_vcs_push"){obj={tool,branch:String(extra.branch||""),remote:String(extra.remote||""),remote_url:String(extra.remote_url||""),head_sha:String(extra.head_sha||"")}
  }else if(tool==="ade_vcs_stage"){obj={tool,paths:Array.isArray(input.paths)?[...input.paths].map(String).sort():[],worktree_content_sha256:String(extra.worktree_content_sha256||"")}
  }else if(tool==="ade_project_check"||tool==="ade_diagnostic_check"){obj={tool,name:String(input.name||""),definition_sha256:String(extra.definition_sha256||"")}
  }else{obj={tool,input_sha256:crypto.createHash("sha256").update(canonicalStringify(input)).digest("hex")}}
  return hashResource(obj)
}

async function createTestGrant(root, tool, input, extra={}) {
  if(tool==="ade_tracker_project_sync"&&!extra.target){ const cfg=JSON.parse(await fs.readFile(path.join(root,".ai","integrations.json"),"utf8")); const g=cfg.work_management?.github||{}; extra={...extra,target:{provider:"github",connection_id:String(g.connection_id||"github"),host:"api.github.com",owner:String(g.owner||""),repository:String(g.repository||""),project_owner:String(g.project_owner||g.owner||""),project_number:Number(g.project_number||0),project_id:""}} }
  const projectHash=await projectHashForRoot(root)
  const fp=resourceFingerprintFor(tool, input, extra)
  const file=path.join(grantsRootDir(), `${projectHash}.jsonl`)
  await fs.mkdir(path.dirname(file), {recursive:true, mode:0o700})
  // Implement same as plugin: read, prune expired, append, atomic write with lock
  const lock=`${file}.lock`
  // Simple lock via mkdir? Use file lock via open wx
  let handle
  for(let i=0;i<50;i++){
    try{ handle=await fs.open(lock, "wx", 0o600); await handle.writeFile(JSON.stringify({pid:process.pid})); break } catch(e){ if(e.code!=="EEXIST") throw e; await new Promise(r=>setTimeout(r,20)) }
  }
  if(!handle) throw new Error("grant lock timeout")
  try{
    let grants=[]
    try{ const raw=await fs.readFile(file,"utf8"); for(const line of raw.split(/\r?\n/)){ if(!line.trim()) continue; try{ grants.push(JSON.parse(line)) }catch{}} }catch{}
    const now=Date.now()
    grants=grants.filter(g=>{ const exp=Date.parse(g.expires_at||""); return Number.isFinite(exp)&&exp>now&&(g.remaining_uses??0)>0 })
    const grant={id:`gr-${crypto.randomUUID()}`,action:tool,project_hash:projectHash,resource_hash:fp,issued_at:new Date(now).toISOString(),expires_at:new Date(now+10*60*1000).toISOString(),max_uses:1,remaining_uses:1,nonce:crypto.randomUUID()}
    grants.push(grant)
    const tmp=`${file}.tmp-${crypto.randomUUID()}`
    const h=await fs.open(tmp,"wx",0o600)
    try{ await h.writeFile(grants.map(g=>JSON.stringify(g)).join("\n")+"\n","utf8"); await h.sync() } finally{ await h.close() }
    await fs.rename(tmp,file)
    return grant
  } finally{ try{ await handle.close(); await fs.unlink(lock) }catch{} }
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
      async synthetic() {}, async prompt() {}, async switchAgent() {}, async context() { return [{info:{usage:{inputTokens:120,outputTokens:30},cost:0.01}}] },
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
    integration: { connection: { async active(id) { return { id, type: "test" } }, async resolve() { return { token: "test-token" } } } },
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
    assert.equal(state.tools.size, 28)
    assert.equal(state.commands.size, 12)

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
    const deniedSensitiveRead = { sessionID: "ses_lifecycle", agent: "explorer", action: "read", resources: [path.join(fx.project, ".git", "config")], effect: "allow" }
    await permissionHook(deniedSensitiveRead)
    assert.equal(deniedSensitiveRead.effect, "deny", "permission hook must deny sensitive repository metadata even if frontmatter drifts")
    const deniedWindowsSensitiveRead = { sessionID: "ses_lifecycle", agent: "explorer", action: "read", resources: ["C:\\repo\\.git\\config"], effect: "allow" }
    await permissionHook(deniedWindowsSensitiveRead)
    assert.equal(deniedWindowsSensitiveRead.effect, "deny", "sensitive path guard must recognize Windows separators")

    const retryHook = state.hooks["session:retry"]
    assert.equal(typeof retryHook, "function")
    const retryEvent = { sessionID: "ses_retry", agent: "project-manager", model: { providerID: "p", modelID: "m" }, error: { type: "provider.invalid-request", message: 'only "auto" is supported for tool_choice' }, attempt: 1, decision: { retry: true } }
    await retryHook(retryEvent)
    assert.deepEqual(retryEvent.decision, { retry: false }, "deterministic tool_choice incompatibility must not retry")
    const transient1 = { sessionID: "ses_retry2", agent: "project-manager", model: { providerID: "p", modelID: "m" }, error: { type: "provider.invalid-request", message: "reasoning item expired" }, attempt: 1, decision: { retry: false } }
    await retryHook(transient1)
    assert.deepEqual(transient1.decision, { retry: true, delay: 400 })
    const transient2 = { ...transient1, attempt: 2, decision: { retry: true } }
    await retryHook(transient2)
    assert.deepEqual(transient2.decision, { retry: false }, "same failure signature must open circuit after one retry")

    const orchestratorContext = { sessionID: "ses_lifecycle", agent: "orchestrator", messageID: "msg", id: "call-status", async progress() {} }
    const status = await state.tools.get("ade_status").execute({}, orchestratorContext)
    const statusValue = JSON.parse(status.content)
    assert.equal(path.resolve(statusValue.project_root), path.resolve(fx.project))
    assert.equal(statusValue.plugin.version, "5.2.6")

    const evidenceContext = { sessionID: "ses_lifecycle", agent: "researcher", messageID: "msg", id: "call-evidence", async progress() {} }
    const evidence = await state.tools.get("ade_evidence_record").execute({ plane: "engineering", state: "OBSERVADO", summary: "legacy evidence shape migration" }, evidenceContext)
    const evidenceValue = JSON.parse(evidence.content)
    assert.equal(evidenceValue.state, "OBSERVADO")
    const persisted = JSON.parse(await fs.readFile(path.join(fx.project, ".ai", "control.json"), "utf8"))
    assert.ok(Array.isArray(persisted.evidence))
    assert.equal(persisted.evidence_count, 1)
    const evidenceLog = await fs.readFile(path.join(fx.project, ".ai", "evidence.jsonl"), "utf8")
    assert.match(evidenceLog, /legacy evidence shape migration/)


    const handoffContext = { sessionID: "ses_lifecycle", agent: "explorer", messageID: "msg", id: "call-handoff", async progress() {} }
    const handoff = await state.tools.get("ade_handoff_submit").execute({ status: "BLOCKED", blocker: "tracker read requires delivery owner", required_owner: "project-manager", next: "tracker-operator", evidence_refs: ["issue:95"] }, handoffContext)
    const handoffValue = JSON.parse(handoff.content)
    assert.equal(handoffValue.canonical, true)
    assert.equal(handoffValue.source_agent, "explorer")
    assert.equal(handoffValue.required_owner, "project-manager")
    const afterHandoff = JSON.parse(await fs.readFile(path.join(fx.project, ".ai", "control.json"), "utf8"))
    assert.equal(afterHandoff.recent_handoffs.length, 1)
    assert.equal(afterHandoff.recent_handoffs[0].status, "BLOCKED")
    assert.equal(afterHandoff.revision, persisted.revision, "handoff communication must not mutate canonical state revision")
    const handoffLog = await fs.readFile(path.join(fx.project, ".ai", "handoffs.jsonl"), "utf8")
    assert.match(handoffLog, /tracker read requires delivery owner/)

    const invalidOwner = await state.tools.get("ade_handoff_submit").execute({ status: "BLOCKED", blocker: "bad owner", required_owner: "product-owner" }, handoffContext)
    const invalidOwnerValue = JSON.parse(invalidOwner.content)
    assert.equal(invalidOwnerValue.status, "BLOCKED")
    assert.match(invalidOwnerValue.error, /HANDOFF_AUTHORITY_VIOLATION/)

    const engineerTransitionContext = { sessionID: "ses_lifecycle", agent: "engineer", messageID: "msg", id: "call-eng-transition", async progress() {} }
    const engTransition = await state.tools.get("ade_engineering_transition").execute({ target: "READY_FOR_IMPLEMENTATION", note: "runtime handoff transition" }, engineerTransitionContext)
    const engTransitionValue = JSON.parse(engTransition.content)
    assert.equal(engTransitionValue.to, "READY_FOR_IMPLEMENTATION")
    assert.equal(engTransitionValue.canonical_handoff.origin, "runtime")
    assert.equal(engTransitionValue.canonical_handoff.source_agent, "engineer")
    assert.equal(engTransitionValue.post_state.engineering.status, "READY_FOR_IMPLEMENTATION")

    const originalFetch = globalThis.fetch
    let snapshotCount = 0
    const graphqlCalls = []
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body)
      graphqlCalls.push(body)
      if (String(body.query).includes("updateProjectV2ItemFieldValue")) {
        return { ok: true, status: 200, async text() { return JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM95" } } } }) }, async json() { return { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM95" } } } } } }
      }
      snapshotCount++
      const value = snapshotCount === 1 ? "Todo" : "Done"
      const payload = { data: { user: { projectV2: {
        id: "PVT_TEST", title: "Delivery",
        fields: { nodes: [{ id: "FIELD_STATUS", name: "Status", dataType: "SINGLE_SELECT", options: [{ id: "OPT_TODO", name: "Todo" }, { id: "OPT_DONE", name: "Done" }] }] },
        items: { nodes: [{ id: "ITEM95", content: { number: 95, title: "RQ-050", url: "https://example.test/issues/95" }, fieldValues: { nodes: [{ field: { name: "Status" }, name: value, optionId: value === "Done" ? "OPT_DONE" : "OPT_TODO" }] } }] }
      } }, organization: null } }
      return { ok: true, status: 200, async text() { return JSON.stringify(payload) }, async json() { return payload } }
    }
    try {
      const pmContext = { sessionID: "ses_lifecycle", agent: "project-manager", messageID: "msg", id: "call-project-sync", async progress() {} }
      await createTestGrant(fx.project, "ade_tracker_project_sync", {updates:[{external_id:"95",fields:[{name:"Status",value:"Done"}]}]})
      const sync = await state.tools.get("ade_tracker_project_sync").execute({ updates: [{ external_id: "95", fields: [{ name: "Status", value: "Done" }] }] }, pmContext)
      const syncValue = JSON.parse(sync.content)
      assert.equal(syncValue.status, "TRACKER_SYNC_DONE")
      assert.equal(syncValue.requested, 1)
      assert.equal(syncValue.updated, 1)
      assert.equal(syncValue.verified, 1)
      assert.equal(syncValue.failed, 0)
      assert.equal(syncValue.canonical_handoff.origin, "runtime")
      assert.equal(syncValue.canonical_handoff.source_agent, "project-manager")
      assert.equal(syncValue.post_state.routing_hint.owner, "engineer")
      assert.equal(graphqlCalls.filter(x => String(x.query).includes("updateProjectV2ItemFieldValue")).length, 1)
      const ctl = JSON.parse(await fs.readFile(path.join(fx.project, ".ai", "control.json"), "utf8"))
      assert.equal(ctl.recent_handoffs.at(-1).origin, "runtime")

      const mutationsBeforeDuplicate = graphqlCalls.filter(x => String(x.query).includes("updateProjectV2ItemFieldValue")).length
      await createTestGrant(fx.project, "ade_tracker_project_sync", {updates:[{external_id:"95",fields:[{name:"Status",value:"Done"},{name:"Status",value:"Todo"}]}]})
      const duplicate = await state.tools.get("ade_tracker_project_sync").execute({ updates: [{ external_id: "95", fields: [{ name: "Status", value: "Done" }, { name: "Status", value: "Todo" }] }] }, pmContext)
      const duplicateValue = JSON.parse(duplicate.content)
      assert.equal(duplicateValue.status, "TRACKER_SYNC_BLOCKED_PREFLIGHT")
      assert.match(JSON.stringify(duplicateValue.failures), /duplicate item\/field update/)
      assert.equal(graphqlCalls.filter(x => String(x.query).includes("updateProjectV2ItemFieldValue")).length, mutationsBeforeDuplicate, "duplicate preflight must not mutate remote state")

      await createTestGrant(fx.project, "ade_tracker_project_sync", {updates:[{external_id:"95",fields:[{name:"Status",value:"github_pat_123456789012345678901234567890"}]}]})
      const secretSync = await state.tools.get("ade_tracker_project_sync").execute({ updates: [{ external_id: "95", fields: [{ name: "Status", value: "github_pat_123456789012345678901234567890" }] }] }, pmContext)
      const secretSyncValue = JSON.parse(secretSync.content)
      assert.equal(secretSyncValue.status, "BLOCKED")
      assert.match(secretSyncValue.error, /TRACKER_OUTBOUND_BLOCKED/)
    } finally { globalThis.fetch = originalFetch }

    const explorerContext = { sessionID: "ses_lifecycle", agent: "explorer", messageID: "msg", id: "call-vcs", async progress() {} }
    const vcs = await state.tools.get("ade_vcs_status").execute({}, explorerContext)
    const vcsValue = JSON.parse(vcs.content)
    assert.equal(vcsValue.status, "OBSERVADO")
    const statusCall = state.vcsCalls.find(([name]) => name === "status")
    assert.deepEqual(statusCall[1], { location: { directory: path.resolve(fx.project) } })

    await fs.appendFile(path.join(fx.project, ".ai", "evidence.jsonl"), "{not-json}\n", "utf8")
    const poisoned = await state.tools.get("ade_evidence_query").execute({ limit: 5 }, { sessionID: "ses_lifecycle", agent: "researcher", messageID: "msg", id: "call-poison", async progress() {} })
    const poisonedValue = JSON.parse(poisoned.content)
    assert.equal(poisonedValue.status, "BLOCKED")
    assert.match(poisonedValue.error, /LOG_CORRUPT/)

    const controlPath = path.join(fx.project, ".ai", "control.json")
    const outsideControl = path.join(fx.temp, "outside-control.json")
    await fs.copyFile(controlPath, outsideControl)
    await fs.unlink(controlPath)
    await fs.symlink(outsideControl, controlPath)
    const unsafeControl = await state.tools.get("ade_status").execute({}, orchestratorContext)
    const unsafeControlValue = JSON.parse(unsafeControl.content)
    assert.equal(unsafeControlValue.status, "BLOCKED")
    assert.match(unsafeControlValue.error, /symlink|unsafe/i)

    if (typeof cleanup === "function") await cleanup()
  } finally {
    try { const ph=await projectHashForRoot(fx.project); await fs.unlink(path.join(grantsRootDir(), `${ph}.jsonl`)).catch(()=>{}); await fs.unlink(path.join(grantsRootDir(), `${ph}.jsonl.lock`)).catch(()=>{}) } catch {}
    await fs.rm(fx.temp, { recursive: true, force: true })
  }
})


test("beta SDK without named Plugin export falls back to raw default contract", async () => {
  const fx = await fixture({ legacySdk: true })
  try {
    const url = `${pathToFileURL(path.join(fx.runtime, "src", "index.ts")).href}?legacy=${Date.now()}`
    const mod = await import(url)
    assert.equal(mod.default.id, "ai-driven-engineering.native")
    assert.equal(typeof mod.default.setup, "function")
  } finally {
    await fs.rm(fx.temp, { recursive: true, force: true })
  }
})
