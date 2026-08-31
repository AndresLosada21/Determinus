import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const cap=JSON.parse(fs.readFileSync(new URL("../capabilities.json",import.meta.url)))
const src=fs.readFileSync(new URL("../src/index.ts",import.meta.url),"utf8")
const agentsDir=fileURLToPath(new URL("../../agents",import.meta.url))
function text(name){return fs.readFileSync(path.join(agentsDir,`${name}.md`),"utf8")}

test("v6 active agents cannot directly invoke high-impact mutation tools",()=>{const high=["ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"];for(const [agent,tools] of Object.entries(cap.agents))for(const h of high)assert.ok(!tools.includes(h),`${agent} exposes ${h}`)})
test("orchestrator gets read-only tracker snapshot but mutation must be a kernel workflow",()=>{assert.ok(cap.agents.orchestrator.includes("ade_tracker_project_snapshot"));assert.ok(cap.agents.orchestrator.includes("ade_workflow_start"));assert.ok(!cap.agents.orchestrator.includes("ade_tracker_project_sync"));assert.ok(src.includes('job.type==="TRACKER_SYNC"'));assert.ok(src.includes('consumeHumanGrant(root,"ade_tracker_project_sync"'))})
test("exact-effect external grant boundary remains fail-closed under auto approve",()=>{for(const marker of ["HUMAN_AUTHORIZATION_REQUIRED","ADE_HUMAN_AUTHORIZATION_REQUIRED",'event.effect="ask"',"AUTO_APPROVED","EXPLICIT_EXTERNAL_GRANT","GRANT_MAX_USES = 1"])assert.ok(src.includes(marker),marker)})
test("active agent frontmatter denies native subagent and shell",()=>{for(const a of Object.keys(cap.agents)){const t=text(a);assert.match(t,/action: subagent[\s\S]*?effect: deny/);assert.match(t,/action: shell[\s\S]*?effect: deny/)}})
test("legacy organizational roles are explicitly disabled",()=>{for(const a of ["product-owner","project-manager","engineer","researcher","modeler","engineering-planner","tester","debugger","security-reviewer","integrator","documenter","tracker-operator","vcs-operator"])assert.match(text(a),/disabled: true/,a)})
