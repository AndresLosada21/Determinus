import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const cap=JSON.parse(fs.readFileSync(new URL("../capabilities.json",import.meta.url)))
const pkg=JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url)))
const src=fs.readFileSync(new URL("../src/index.ts",import.meta.url),"utf8")
const tools=Object.keys(cap.tools)

test("registry has 18 agents and 25 typed tools",()=>{
  assert.equal(Object.keys(cap.agents).length,18)
  assert.equal(tools.length,25)
  assert.ok(tools.includes("ade_route_snapshot"))
})

test("orchestrator surface is compact and state-driven",()=>{
  assert.deepEqual(new Set(cap.agents.orchestrator),new Set(["ade_status","ade_route_snapshot"]))
  assert.ok(!cap.agents.orchestrator.includes("ade_doctor"))
  assert.ok(!cap.agents.orchestrator.includes("ade_state_get"))
})

test("least privilege role boundaries",()=>{
  assert.ok(!cap.agents.explorer.includes("ade_tracker_read"))
  assert.ok(!cap.agents.explorer.includes("ade_tracker_write"))
  assert.ok(!cap.agents.implementer.includes("ade_project_check"))
  assert.ok(cap.agents.implementer.includes("ade_self_check"))
  assert.ok(!cap.agents.debugger.includes("ade_project_check"))
  assert.ok(cap.agents.debugger.includes("ade_diagnostic_check"))
  assert.ok(cap.agents.verifier.includes("ade_project_check"))
  assert.ok(!cap.agents.verifier.includes("ade_vcs_push"))
})

test("generation budgets are defined for every agent",()=>{
  assert.deepEqual(new Set(Object.keys(cap.generation_max_tokens)),new Set(Object.keys(cap.agents)))
  for(const n of Object.values(cap.generation_max_tokens)) assert.ok(Number.isInteger(n)&&n>=500&&n<=2000)
  assert.ok(src.includes("event.generation.maxTokens=budget"))
})

test("OpenCode V2 Promise plugin contract is explicit",()=>{
  assert.match(src,/import \{ Plugin \} from "@opencode-ai\/plugin"/)
  assert.ok(src.includes("export default Plugin.define({"))
  assert.equal(pkg.peerDependencies["@opencode-ai/plugin"],">=1.18.15")
  assert.equal(pkg.exports,"./src/index.ts")
})

test("session-scoped project location replaces plugin instance location",()=>{
  assert.ok(src.includes("async function resolveSessionScope"))
  assert.ok(src.includes("ctx.session.get({ sessionID })"))
  assert.ok(src.includes("ctx.agent.list({ location: { directory } })"))
  assert.ok(src.includes("project.directory || directory"))
  assert.ok(!src.includes("ctx.location?.project"))
  assert.ok(!src.includes("ctx.location?.directory"))
})

test("context hook restricts tools and caps generation without modifying system",()=>{
  assert.ok(src.includes('ctx.session.hook("context"'))
  assert.ok(src.includes("delete event.tools[name]"))
  assert.ok(src.includes("event.generation.maxTokens=budget"))
  assert.ok(!src.includes("event.system.push"))
  assert.ok(!src.includes("event.system ="))
})

test("provider invalid-request retry is bounded",()=>{
  assert.ok(src.includes('ctx.session.hook("retry"'))
  assert.ok(src.includes('event.error?.type==="provider.invalid-request"'))
  assert.ok(src.includes("event.attempt||0)<3"))
  assert.ok(src.includes("event.decision={retry:true,delay:400}"))
})

test("evidence storage normalizes legacy shapes and uses durable log",()=>{
  assert.ok(src.includes("function normalizeEvidence"))
  assert.ok(src.includes("Array.isArray(value)"))
  assert.ok(src.includes("evidence.jsonl"))
  assert.ok(src.includes("persistEvidence"))
  assert.ok(src.includes("const limit=i.limit||5"))
})

test("state reads are compact by default",()=>{
  assert.ok(src.includes('add("ade_route_snapshot"'))
  assert.ok(src.includes('detail:str({enum:["compact","full"]})'))
  assert.ok(src.includes("compactControl"))
})

test("native VCS reads are location-aware and use current V2 modes",()=>{
  assert.ok(src.includes("ctx.vcs.status({location:i.__ade_location})"))
  assert.ok(src.includes("ctx.vcs.branches({location:i.__ade_location"))
  assert.ok(src.includes("ctx.vcs.diff({location:i.__ade_location"))
  assert.ok(src.includes('enum:["working","branch","committed"]'))
})

test("tool public schemas do not expose project_root or artificial wire scope",()=>{
  assert.ok(!src.includes("project_root:str()"))
  assert.ok(!src.includes("WIRE_SCOPE"))
  assert.ok(src.includes('...(required.length ? { required: [...required] } : {})'))
})

test("plane validation authority is exclusive",()=>{
  for(const [tool,owner] of [["ade_product_validation_record","product-owner"],["ade_delivery_validation_record","project-manager"],["ade_engineering_validation_record","verifier"]]){
    for(const [agent,owned] of Object.entries(cap.agents)) assert.equal(owned.includes(tool),agent===owner,`${tool} ownership on ${agent}`)
  }
  assert.ok(src.includes('state:str({enum:["OBSERVADO","INFERIDO","PROPOSTO","DESCONHECIDO"]})'))
})

test("acceptance requires current revision-bound validation",()=>{
  for(const marker of ["plane_revision","validated_status","evidência VALIDADO vigente","VALIDATION_BLOCKED"]) assert.ok(src.includes(marker),marker)
})

test("project check missing-check diagnostics expose root policy request and available ids",()=>{
  assert.ok(src.includes("project_root=${root}"))
  assert.ok(src.includes("policy=.ai/execution-policy.json"))
  assert.ok(src.includes("available=[${availableChecks.join(\",\")}]") )
})

test("vcs mutation surface is constrained",()=>{
  assert.ok(!src.includes("--force"))
  assert.ok(!src.includes("force-with-lease"))
  assert.ok(src.includes("--literal-pathspecs"))
  assert.ok(src.includes("assertNoSecretStaged"))
})

test("tracker write is policy gated",()=>{
  assert.ok(src.includes('trackerPolicy=await readJson(trackerPolicyPath)'))
  assert.ok(src.includes('mode==="write"&&!i.dry_run&&trackerPolicy.write?.authorized!==true'))
})

test("debugger diagnostic check stays non-validating",()=>{
  assert.ok(src.includes('i.name,"debugger",false'))
  assert.ok(src.includes('DIAGNOSTIC_CHECK_COMPLETED'))
  assert.ok(src.includes('evidence_state:validationAuthority?"VALIDADO":"OBSERVADO"'))
})

test("GitHub PR authentication comes only from authorized OpenCode integration",()=>{
  assert.ok(src.includes('integrationSecret(ctx,String(g.connection_id||"github"))'))
  assert.ok(!src.includes('process.env.GH_TOKEN'))
  assert.ok(!src.includes('process.env.GITHUB_TOKEN'))
})

test("runtime observation does not expose Docker env or labels",()=>{
  assert.ok(src.includes('{{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}'))
  assert.ok(src.includes('{{.Id}}\\t{{json .RepoTags}}\\t{{.Size}}\\t{{.Created}}'))
})

test("content-executing paths resolve realpath inside project",()=>{
  assert.ok(src.includes("safeExistingRealPath"))
  assert.ok(src.includes("fs.realpath(root)"))
  assert.ok(src.includes("fs.realpath(lexical)"))
})

test("all ADE agents hide raw shell and execute",()=>{
  for(const agent of Object.keys(cap.agents)){
    const hidden=new Set(cap.hide_core_tools?.[agent]||[])
    assert.ok(hidden.has("shell"),`${agent}: shell visible`)
    assert.ok(hidden.has("execute"),`${agent}: execute visible`)
  }
})

test("observability commands are registered",()=>{
  for(const cmd of ["ade-why","ade-trace","ade-metrics","ade-doctor"]) assert.ok(src.includes(`name:"${cmd}"`))
  assert.ok(src.includes("telemetry.jsonl"))
  assert.ok(src.includes("duration_ms"))
})
