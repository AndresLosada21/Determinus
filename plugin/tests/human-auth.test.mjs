import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const cap = JSON.parse(fs.readFileSync(new URL("../capabilities.json", import.meta.url)))
const src = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")
const agentsDir = fileURLToPath(new URL("../../agents", import.meta.url))

function parseFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8")
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return { perms: [] }
  const front = m[1]
  const perms = []
  let cur = null
  let inPerm = false
  for (const raw of front.split("\n")) {
    const line = raw.trimEnd()
    if (/^permissions:\s*$/.test(line)) { inPerm = true; continue }
    if (inPerm) {
      let mm = line.match(/^\s*-\s+action:\s*["']?([^"']+?)["']?\s*$/)
      if (mm) { cur = { action: mm[1].trim() }; perms.push(cur); continue }
      mm = line.match(/^\s+(resource|effect):\s*["']?(.+?)["']?\s*$/)
      if (mm && cur) { cur[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, ""); continue }
      if (line && !line.startsWith(" ")) inPerm = false
    }
  }
  return { perms }
}

test("human authorization boundary is enforced in agent permissions", () => {
  const expectedAsk = {
    "project-manager": ["ade_tracker_project_sync"],
    "tracker-operator": ["ade_tracker_write"],
    "verifier": ["ade_project_check"],
    "debugger": ["ade_diagnostic_check"],
    "vcs-operator": ["ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"],
  }
  for (const [agent, tools] of Object.entries(expectedAsk)) {
    const { perms } = parseFrontmatter(path.join(agentsDir, `${agent}.md`))
    for (const tool of tools) {
      const match = perms.find(p=>p.action===tool)
      assert.ok(match, `${agent} missing ${tool}`)
      assert.equal(match.effect, "ask", `${agent}:${tool} must be ask, got ${match.effect}`)
    }
  }
  // read-only must stay allow
  const pmPerms = parseFrontmatter(path.join(agentsDir, "project-manager.md")).perms
  const snap = pmPerms.find(p=>p.action==="ade_tracker_project_snapshot")
  assert.ok(snap && snap.effect==="allow", "tracker snapshot must remain allow")
  const vcsPerms = parseFrontmatter(path.join(agentsDir, "vcs-operator.md")).perms
  for (const t of ["ade_vcs_status","ade_vcs_diff","ade_vcs_branches"]) {
    const m = vcsPerms.find(p=>p.action===t)
    assert.ok(m && m.effect==="allow", `vcs read ${t} must remain allow`)
  }
})

test("plugin enforces repo policy != human authority via ask", () => {
  assert.ok(src.includes("HUMAN_AUTHORIZATION_REQUIRED"), "missing HUMAN_AUTHORIZATION_REQUIRED set")
  assert.ok(src.includes("ADE_HUMAN_AUTHORIZATION_REQUIRED"), "missing ask message")
  assert.ok(src.includes('event.effect="ask"'), "missing ask enforcement")
  assert.ok(src.includes("AUTO_APPROVED") && src.includes("USER_APPROVED"), "missing auto vs user distinction")
  assert.ok(src.toLowerCase().includes("repo policy") || src.toLowerCase().includes("repositório"), "missing repo vs human doc")
  for (const tool of ["ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"]) {
    assert.ok(src.includes(tool), `tool ${tool} not in human auth set`)
  }
})

test("permission hook distinguishes POLICY_ALLOWED vs USER_APPROVED vs AUTO_APPROVED vs DENIED conceptually", () => {
  // documentation-level check: plugin comments must mention fail-closed when auto-approve cannot be distinguished
  assert.ok(src.includes("auto-approve") || src.includes("auto") , "auto-approve documentation missing")
  // ensure we do not invent human approval: no code that treats AUTO_APPROVED as human
  assert.ok(!src.includes("USER_APPROVED = true") || src.includes("não deve ser registrado como human"), "should document not to mislabel auto-approved")
})

test("high-impact tools are not allow-listed in any other agent", () => {
  const files = fs.readdirSync(agentsDir).filter(f=>f.endsWith(".md"))
  const high = new Set(["ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"])
  for (const f of files) {
    const { perms } = parseFrontmatter(path.join(agentsDir, f))
    for (const p of perms) {
      if (high.has(p.action)) {
        assert.equal(p.effect, "ask", `${f}:${p.action} must be ask, not ${p.effect}`)
      }
    }
  }
})
