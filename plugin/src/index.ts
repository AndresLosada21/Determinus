import * as OpenCodePlugin from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import os from "node:os"
import { fileURLToPath } from "node:url"

const VERSION = "5.2.7"
const PLUGIN_ID = "ai-driven-engineering.native"
const TOOL_PREFIX = "ade_"
const pluginDefine = typeof (OpenCodePlugin as any)?.Plugin?.define === "function"
  ? (OpenCodePlugin as any).Plugin.define.bind((OpenCodePlugin as any).Plugin)
  : (value: any) => value
const PLUGIN_CONTRACT = typeof (OpenCodePlugin as any)?.Plugin?.define === "function" ? "Plugin.define" : "raw-default-compat"
const SECRET_FILE = /(^|[\\/])(\.env(?:\..*)?|[^\\/]*\.(pem|key|p12|pfx|kdbx|ovpn|npmrc|netrc|pypirc)|id_rsa|id_ed25519|credentials?|secrets?|tokens?|[^\\/]*(credential|credentials|secret|secrets|token)[^\\/]*\.json)$/i
const SENSITIVE_RESOURCE = /(^|[\\/])(?:\.git|\.ssh|\.aws|\.config[\\/]gh)(?:[\\/]|$)|(^|[\\/])\.docker[\\/]config\.json$/i
const SENSITIVE_TEXT_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:xox[baprs]-[A-Za-z0-9-]{16,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*[\"']?[A-Za-z0-9._~+\/-]{16,}[\"']?/gi,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{16,}={0,2}\b/gi,
]
const MAX_JSON_BYTES = 2_000_000
const MAX_TOOL_TEXT = 200_000
const LOG_LIMITS: Record<string,{maxBytes:number,backups:number}> = {
  "audit.jsonl": {maxBytes: 8_000_000, backups: 3},
  "evidence.jsonl": {maxBytes: 8_000_000, backups: 3},
  "telemetry.jsonl": {maxBytes: 12_000_000, backups: 2},
  "handoffs.jsonl": {maxBytes: 6_000_000, backups: 3},
}
const HUMAN_REQUIRED = new Set(["ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"])
const GRANT_TTL_MS = 10*60*1000
const GRANT_MAX_USES = 1
function grantsRootDir(): string {
  const home = os.homedir()
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    return path.join(base, "opencode", "ade-grants")
  }
  const base = process.env.XDG_STATE_HOME || path.join(home, ".local", "state")
  return path.join(base, "opencode", "ade-grants")
}
function normalizedPathKey(value:string):string{
  const resolved=path.resolve(value)
  return process.platform==="win32" ? resolved.toLowerCase() : resolved
}
function pathEqOrInside(base:string,candidate:string):boolean{
  const b=normalizedPathKey(base),c=normalizedPathKey(candidate),rel=path.relative(b,c)
  return rel==="" || (!rel.startsWith("..")&&!path.isAbsolute(rel))
}
function resourceTouchesGrantStore(resource:any):boolean{
  let raw=String(resource||"").trim(); if(!raw) return false
  if(raw.startsWith("file://")){try{raw=fileURLToPath(raw)}catch{}}
  if(!path.isAbsolute(raw)) return false
  return pathEqOrInside(grantsRootDir(),raw)
}
async function ensureGrantsDir(): Promise<string> {
  const dir = path.resolve(grantsRootDir())
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const st=await fs.lstat(dir); if(st.isSymbolicLink()||!st.isDirectory()) throw new Error("ADE_GRANT_STORE_UNSAFE: grants root must be a regular directory")
  const real=await fs.realpath(dir)
  if(normalizedPathKey(real)!==normalizedPathKey(dir)) throw new Error("ADE_GRANT_STORE_UNSAFE: grants root or parent resolves through symlink/junction")
  if (process.platform !== "win32") try { await fs.chmod(dir, 0o700) } catch {}
  return real
}
async function assertGrantStoreSafeForProject(root:string):Promise<string>{
  const store=await ensureGrantsDir()
  const project=await fs.realpath(root)
  if(pathEqOrInside(project,store)||pathEqOrInside(store,project)) throw new Error("ADE_GRANT_STORE_UNSAFE: grant store must be disjoint from project root")
  return store
}
function canonicalStringify(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]"
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort()
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalStringify(value[k])).join(",") + "}"
  }
  return JSON.stringify(value)
}
function sha256Hex(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}
function hashResource(obj: any): string {
  // Authorization fingerprints use the full SHA-256. Only the digest is persisted;
  // semantic payloads remain transient.
  return sha256Hex(canonicalStringify(obj))
}
async function projectHashForRoot(root: string): Promise<string> {
  const real = await fs.realpath(root)
  return crypto.createHash("sha256").update(process.platform==="win32"?real.toLowerCase():real).digest("hex")
}
function grantFileForProjectHash(projectHash: string): string {
  return path.join(grantsRootDir(), `${projectHash}.jsonl`)
}
async function readGrants(projectHash: string): Promise<any[]> {
  const file = grantFileForProjectHash(projectHash)
  try { await fs.access(file) } catch { return [] }
  try {
    const st = await fs.lstat(file)
    if (st.isSymbolicLink() || !st.isFile()) return []
  } catch { return [] }
  const st=await fs.stat(file);if(st.size>1_000_000)throw new Error("ADE_GRANT_STORE_CORRUPT: grant file exceeds 1MB")
  const raw = await fs.readFile(file, "utf8")
  const out: any[] = [];let corrupt=0
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const g = JSON.parse(line)
      const valid=g&&typeof g==="object"&&/^gr-[0-9a-f-]{20,}$/i.test(String(g.id||""))&&HUMAN_REQUIRED.has(String(g.action||""))&&/^[0-9a-f]{64}$/i.test(String(g.project_hash||""))&&/^[0-9a-f]{64}$/i.test(String(g.resource_hash||""))&&Number(g.max_uses)===1&&Number(g.remaining_uses)===1&&Number.isFinite(Date.parse(String(g.expires_at||"")))
      if(!valid){corrupt++;continue} out.push(g)
    } catch { corrupt++ }
  }
  if(corrupt)throw new Error(`ADE_GRANT_STORE_CORRUPT: invalid_records=${corrupt}`)
  return out
}
async function writeGrantsAtomic(projectHash: string, grants: any[]): Promise<void> {
  const file = grantFileForProjectHash(projectHash)
  await ensureGrantsDir()
  const tmp = `${file}.tmp-${crypto.randomUUID()}`
  const content = grants.map(g => JSON.stringify(g)).join("\n") + (grants.length ? "\n" : "")
  const h = await fs.open(tmp, "wx", 0o600)
  try { await h.writeFile(content, "utf8"); await h.sync() } finally { await h.close() }
  await fs.rename(tmp, file)
}
async function createHumanGrant(root: string, action: string, resourceHash: string, opts: { ttlMs?: number, maxUses?: number } = {}): Promise<any> {
  const projectHash = await projectHashForRoot(root)
  await assertGrantStoreSafeForProject(root)
  const now = Date.now(),ttl=Math.min(Math.max(Number(opts.ttlMs ?? GRANT_TTL_MS),1000),GRANT_TTL_MS),maxUses=Number(opts.maxUses ?? GRANT_MAX_USES)
  if(maxUses!==1)throw new Error("ADE_GRANT_BLOCKED: grants are single-use only")
  const grant = {
    id: `gr-${crypto.randomUUID()}`,
    action,
    project_hash: projectHash,
    resource_hash: resourceHash,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(),
    max_uses: maxUses,
    remaining_uses: maxUses,
    nonce: crypto.randomUUID(),
  }
  const file = grantFileForProjectHash(projectHash)
  await ensureGrantsDir()
  const lock = `${file}.lock`
  return withFileLock(lock, 5000, async () => {
    const grants = await readGrants(projectHash)
    // prune expired
    const nowMs = Date.now()
    const filtered = grants.filter(g => {
      const exp = Date.parse(g.expires_at || "")
      return Number.isFinite(exp) && exp > nowMs && (g.remaining_uses ?? 0) > 0
    })
    filtered.push(grant)
    await writeGrantsAtomic(projectHash, filtered)
    return grant
  })
}
async function consumeHumanGrant(root: string, action: string, resourceHash: string): Promise<{ consumed: boolean, grantId?: string, reason?: string }> {
  const projectHash = await projectHashForRoot(root)
  await assertGrantStoreSafeForProject(root)
  const file = grantFileForProjectHash(projectHash)
  const lock = `${file}.lock`
  return withFileLock(lock, 5000, async () => {
    const grants = await readGrants(projectHash)
    const nowMs = Date.now()
    let targetIdx = -1
    let target: any = null
    // Do not consider grants inside .ai/* — those are ignored by design (outside root, but check realpath)
    // Grants are only read from grantsRootDir, so .ai grants are never considered.
    for (let i = 0; i < grants.length; i++) {
      const g = grants[i]
      if (g.action !== action) continue
      if (g.project_hash !== projectHash) continue
      if (g.resource_hash !== resourceHash) continue
      const exp = Date.parse(g.expires_at || "")
      if (!Number.isFinite(exp) || exp <= nowMs) continue
      if ((g.remaining_uses ?? 0) <= 0) continue
      targetIdx = i
      target = g
      break
    }
    if (targetIdx === -1) {
      // clean expired
      const filtered = grants.filter(g => {
        const exp = Date.parse(g.expires_at || "")
        return Number.isFinite(exp) && exp > nowMs && (g.remaining_uses ?? 0) > 0
      })
      if (filtered.length !== grants.length) await writeGrantsAtomic(projectHash, filtered)
      return { consumed: false, reason: "ADE_HUMAN_AUTHORIZATION_REQUIRED: no matching unexpired single-use grant for this action/resource; run /ade-authorize" }
    }
    target.remaining_uses = Number(target.remaining_uses || 0) - 1
    let remaining = grants.slice()
    if (target.remaining_uses <= 0) remaining.splice(targetIdx, 1)
    else remaining[targetIdx] = target
    await writeGrantsAtomic(projectHash, remaining)
    return { consumed: true, grantId: target.id }
  })
}
function resourceFingerprintFor(tool: string, input: any, extra: any = {}): string {
  let obj: any = { tool }
  if (tool === "ade_tracker_project_sync") {
    const updates = Array.isArray(input.updates) ? input.updates : []
    const norm = updates.map((u: any) => ({
      external_id: String(u.external_id || ""),
      item_id: String(u.item_id || ""),
      fields: Array.isArray(u.fields)
        ? [...u.fields].map((f: any) => ({ name: String(f.name || ""), value: String(f.value ?? "") })).sort((a: any, b: any) => a.name.localeCompare(b.name))
        : []
    })).sort((a: any, b: any) => (a.external_id + "|" + a.item_id).localeCompare(b.external_id + "|" + b.item_id))
    obj = { tool, target: extra.target || null, updates: norm }
  } else if (tool === "ade_tracker_write") {
    obj = {
      tool,
      target: extra.target || null,
      action: String(input.action || ""),
      external_id: String(input.external_id || ""),
      internal_id: String(input.internal_id || ""),
      title: String(input.title || ""),
      body_sha256: sha256Hex(String(input.body || "")),
      status: String(input.status || ""),
      url: String(input.url || ""),
      query_sha256: sha256Hex(String(input.query || "")),
    }
  } else if (tool === "ade_vcs_stage") {
    const paths = Array.isArray(input.paths) ? [...input.paths].map(String).sort() : []
    obj = { tool, paths, worktree_content_sha256: String(extra.worktree_content_sha256 || "") }
  } else if (tool === "ade_vcs_commit") {
    obj = {
      tool,
      message: String(input.message || ""),
      branch: String(extra.branch || ""),
      head_sha: String(extra.head_sha || ""),
      staged_diff_sha256: String(extra.staged_diff_sha256 || ""),
      tree_sha: String(extra.tree_sha || ""),
    }
  } else if (tool === "ade_vcs_push") {
    obj = {
      tool,
      branch: String(extra.branch || ""),
      remote: String(extra.remote || ""),
      remote_url: String(extra.remote_url || ""),
      head_sha: String(extra.head_sha || ""),
    }
  } else if (tool === "ade_pr_create") {
    obj = {
      tool,
      owner: String(extra.owner || ""),
      repository: String(extra.repository || ""),
      title: String(input.title || ""),
      base: String(input.base || extra.base || ""),
      head: String(extra.head || ""),
      head_sha: String(extra.head_sha || ""),
      body_sha256: sha256Hex(String(input.body || "")),
    }
  } else if (tool === "ade_project_check" || tool === "ade_diagnostic_check") {
    obj = {
      tool,
      name: String(input.name || ""),
      definition_sha256: String(extra.definition_sha256 || ""),
    }
  } else {
    obj = { tool, input_sha256: sha256Hex(canonicalStringify(input)) }
  }
  return hashResource(obj)
}

async function hashFileStreaming(file: string): Promise<{sha256:string,size:number}> {
  const h = crypto.createHash("sha256")
  const fh = await fs.open(file, "r")
  let size = 0
  try {
    const buf = Buffer.allocUnsafe(256 * 1024)
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, null)
      if (!bytesRead) break
      h.update(buf.subarray(0, bytesRead)); size += bytesRead
      if (size > 256 * 1024 * 1024) throw new Error("VCS_BLOCKED: authorization fingerprint file exceeds 256MB")
    }
  } finally { await fh.close() }
  return { sha256: h.digest("hex"), size }
}

async function currentHeadSha(root: string): Promise<string> {
  const r = await runGit(root,["-C",root,"rev-parse","HEAD"],{timeout:10000})
  if(r.code!==0) throw new Error(cleanErrorText(r.stderr||"VCS_BLOCKED: HEAD indisponível"))
  const sha=r.stdout.trim(); if(!/^[0-9a-f]{40,64}$/i.test(sha)) throw new Error("VCS_BLOCKED: HEAD inválido")
  return sha
}

async function worktreeAuthorizationMaterial(root: string, rawPaths: any): Promise<any> {
  const paths=(Array.isArray(rawPaths)?rawPaths:[]).map((p:any)=>relativeLiteralPath(root,String(p))).sort()
  if(!paths.length) throw new Error("VCS_BLOCKED: paths vazios")
  const listed=await runGit(root,["-C",root,"ls-files","-z","--cached","--others","--exclude-standard","--",...paths],{timeout:20000,maxOutput:2_000_000})
  if(listed.code!==0||listed.truncated)throw new Error("VCS_BLOCKED: authorization file list unavailable or exceeds 2MB")
  const deletedR=await runGit(root,["-C",root,"ls-files","-z","--deleted","--",...paths],{timeout:15000,maxOutput:2_000_000})
  if(deletedR.code!==0||deletedR.truncated)throw new Error("VCS_BLOCKED: authorization deleted-file list unavailable or exceeds 2MB")
  const names=[...new Set(listed.stdout.split("\0").filter(Boolean))].sort();if(names.length>1000)throw new Error("VCS_BLOCKED: authorization path expansion exceeds 1000 files")
  const files:any[]=[]
  for(const rel of names){
    const lexical=path.resolve(root,rel);if(!inside(root,lexical))throw new Error("VCS_BLOCKED: authorization path escaped project")
    const st=await fs.lstat(lexical)
    if(st.isSymbolicLink()){const target=await fs.readlink(lexical);files.push({path:rel.replaceAll("\\","/"),type:"symlink",target_sha256:sha256Hex(target),mode:st.mode&0o777})}
    else if(st.isFile()){const digest=await hashFileStreaming(lexical);files.push({path:rel.replaceAll("\\","/"),type:"file",...digest,executable:Boolean(st.mode&0o111)})}
  }
  return {paths,files,deleted:[...new Set(deletedR.stdout.split("\0").filter(Boolean))].sort()}
}

async function stagedAuthorizationMaterial(root: string): Promise<any> {
  const branch=await currentBranch(root),head_sha=await currentHeadSha(root)
  const raw=await runGit(root,["-C",root,"diff","--cached","--raw","-z","--no-abbrev"],{timeout:30000,maxOutput:2_000_000})
  if(raw.code!==0||raw.truncated)throw new Error("VCS_BLOCKED: staged authorization metadata unavailable or exceeds 2MB")
  const tree=await runGit(root,["-C",root,"write-tree"],{timeout:15000,maxOutput:10000});if(tree.code!==0||tree.truncated)throw new Error("VCS_BLOCKED: staged tree unavailable")
  const tree_sha=tree.stdout.trim();if(!/^[0-9a-f]{40,64}$/i.test(tree_sha))throw new Error("VCS_BLOCKED: staged tree hash inválido")
  return {branch,head_sha,staged_diff_sha256:sha256Hex(raw.stdout),tree_sha}
}


async function projectCheckDefinitionMaterial(root:string,name:string,expectedOwner:"verifier"|"debugger"):Promise<any>{
  const policy=await readProjectJson(root,".ai/execution-policy.json","execution policy")
  if(policy.authorized!==true) throw new Error("PROJECT_CHECK_BLOCKED: policy authorized=false")
  const c=policy.checks?.[name]; if(!c) throw new Error(`PROJECT_CHECK_BLOCKED: check '${name}' ausente`)
  if(c.owner!==expectedOwner || c.non_destructive!==true) throw new Error(`PROJECT_CHECK_BLOCKED: owner/non_destructive inválido; expected=${expectedOwner}`)
  return {name,definition_sha256:sha256Hex(canonicalStringify({authorized:true,check:c}))}
}


const PRODUCT_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["NEEDS_HUMAN_DECISION","AUTHORIZED_BY_REQUEST","SUPERSEDED"],
  NEEDS_HUMAN_DECISION: ["AUTHORIZED_BY_REQUEST","SUPERSEDED"],
  AUTHORIZED_BY_REQUEST: ["APPROVED","PRODUCT_ACCEPTED","SUPERSEDED"],
  APPROVED: ["PRODUCT_ACCEPTED","SUPERSEDED"],
  PRODUCT_ACCEPTED: ["SUPERSEDED"], SUPERSEDED: [],
}
const DELIVERY_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT:["NEEDS_DISCOVERY","NEEDS_DECISION","BLOCKED","READY"], NEEDS_DISCOVERY:["NEEDS_DECISION","BLOCKED","READY"],
  NEEDS_DECISION:["BLOCKED","READY"], BLOCKED:["NEEDS_DISCOVERY","NEEDS_DECISION","READY"], READY:["IN_EXECUTION","BLOCKED"],
  IN_EXECUTION:["BLOCKED","DELIVERY_ACCEPTED"], DELIVERY_ACCEPTED:[],
}
const ENGINEERING_TRANSITIONS: Record<string, readonly string[]> = {
  DISCOVERING:["NEEDS_DECISION","READY_FOR_IMPLEMENTATION","BLOCKED"], NEEDS_DECISION:["DISCOVERING","READY_FOR_IMPLEMENTATION","BLOCKED"],
  READY_FOR_IMPLEMENTATION:["IMPLEMENTING","BLOCKED"], IMPLEMENTING:["VERIFYING","BLOCKED"], VERIFYING:["IMPLEMENTING","BLOCKED","ENGINEERING_ACCEPTED"],
  ENGINEERING_ACCEPTED:[], BLOCKED:["DISCOVERING","NEEDS_DECISION","READY_FOR_IMPLEMENTATION","IMPLEMENTING"],
}

type Json = any
const schemaObject = (properties: Record<string, Json>, required: string[] = []) => ({
  type: "object",
  properties: { ...properties },
  ...(required.length ? { required: [...required] } : {}),
  additionalProperties: false,
})
const str = (extra: Json = {}) => ({ type:"string", ...extra })
const bool = () => ({ type:"boolean" })
const integer = (extra: Json = {}) => ({ type:"integer", ...extra })
const stringArray = () => ({ type:"array", items:{ type:"string" } })
const boundedStringArray = (maxItems:number,maxLength:number) => ({ type:"array", maxItems, items:{ type:"string", maxLength } })

function result(value: Json) { return { content: JSON.stringify(value, null, 2) } }
function now() { return new Date().toISOString() }
function asError(e: unknown) { return e instanceof Error ? e.message : String(e) }
function inside(root: string, candidate: string) {
  let r = path.resolve(root); let c = path.resolve(candidate)
  if(process.platform === "win32"){ r=r.toLowerCase(); c=c.toLowerCase() }
  return c === r || c.startsWith(r + path.sep)
}
function cleanErrorText(value:unknown,max=1200){
  let text=String(value??"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim()
  for(const re of SENSITIVE_TEXT_PATTERNS){re.lastIndex=0;text=text.replace(re,"[REDACTED_SECRET]")}
  return text.slice(0,max)
}
function redactSensitiveText(value:string,max=MAX_TOOL_TEXT){
  let text=String(value||"")
  for(const re of SENSITIVE_TEXT_PATTERNS){re.lastIndex=0;text=text.replace(re,"[REDACTED_SECRET]")}
  const lines=text.split(/\r?\n/),out:string[]=[];let suppress=false
  for(const line of lines){
    if(line.startsWith("diff --git ")){
      suppress=/(?:^|[\/])\.git[\/]/i.test(line)||/(?:^|[\/])\.env(?:[.\s]|$)/i.test(line)||/\.(?:pem|key|p12|pfx|kdbx|ovpn)(?:\s|$)/i.test(line)
      out.push(suppress?"diff --git [REDACTED_SECRET_LIKE_PATH]":line);continue
    }
    if(!suppress)out.push(line)
  }
  text=out.join("\n")
  return text.length>max?text.slice(0,max)+"\n[TRUNCATED_BY_ADE]":text
}
function redactForModel(value:any,depth=0):any{
  if(depth>8)return "[TRUNCATED_DEPTH]"
  if(typeof value==="string")return redactSensitiveText(value)
  if(Array.isArray(value))return value.slice(0,500).map(v=>redactForModel(v,depth+1))
  if(value&&typeof value==="object"){
    const out:any={};let count=0
    for(const [k,v] of Object.entries(value)){
      if(++count>500){out.__truncated__=true;break}
      if(/^(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|credential|credentials|authorization|password|passwd)$/i.test(k)){out[k]="[REDACTED_SECRET]";continue}
      out[k]=redactForModel(v,depth+1)
    }
    return out
  }
  return value
}
type SessionScope = {
  sessionID: string
  directory: string
  root: string
  canonical: string
  location: { directory: string }
}

const sessionScopeCache = new Map<string, { directory: string; root: string; canonical: string }>()

async function resolveSessionScope(ctx: any, sessionID: string): Promise<SessionScope> {
  if (!sessionID) throw new Error("CAPABILITY_BLOCKED: sessionID ausente")
  const session = await ctx.session.get({ sessionID })
  const directory = path.resolve(String(session?.location?.directory || ""))
  if (!directory) throw new Error("CAPABILITY_BLOCKED: session location ausente")
  const cached = sessionScopeCache.get(sessionID)
  if (cached?.directory === directory) return { sessionID, directory, root: cached.root, canonical: cached.canonical, location: { directory } }
  const located = await ctx.agent.list({ location: { directory } })
  const project = located?.location?.project || {}
  const root = path.resolve(String(project.directory || directory))
  const canonical = path.resolve(String(project.canonical || root))
  if (!inside(root, directory) && !inside(directory, root)) {
    throw new Error("CAPABILITY_BLOCKED: resolved project root não corresponde à session location")
  }
  sessionScopeCache.set(sessionID, { directory, root, canonical })
  return { sessionID, directory, root, canonical, location: { directory } }
}

function projectRoot(_ctx: any, input?: Json) {
  const root = typeof input?.__ade_root === "string" ? input.__ade_root : ""
  if (!root) throw new Error("CAPABILITY_BLOCKED: session-scoped project root ausente")
  return path.resolve(root)
}

function safeFile(root: string, p: string) {
  if(typeof p!=="string" || p.includes("\0")) throw new Error("CAPABILITY_BLOCKED: path inválido")
  const resolved = path.resolve(root, p)
  if (!inside(root, resolved)) throw new Error("CAPABILITY_BLOCKED: path fora do project root")
  if (SECRET_FILE.test(resolved)) throw new Error("CAPABILITY_BLOCKED: secret-like path")
  return resolved
}
async function safeExistingRealPath(root:string,candidate:string,label:string) {
  const lexical=safeFile(root,candidate); const realRoot=await fs.realpath(root); const real=await fs.realpath(lexical)
  if(!inside(realRoot,real)) throw new Error(`CAPABILITY_BLOCKED: ${label} resolve para fora do project root`)
  if(SECRET_FILE.test(real)) throw new Error(`CAPABILITY_BLOCKED: ${label} resolve para secret-like path`)
  return real
}
async function readProjectJson(root:string,relative:string,label:string):Promise<any>{
  const file=await safeExistingRealPath(root,relative,label)
  const st=await fs.lstat(file);if(st.isSymbolicLink()||!st.isFile())throw new Error(`${label}: arquivo deve ser regular e não symlink`)
  return readJson(file)
}
async function assertRegularNoSymlink(file:string,label:string){
  if(!(await exists(file)))return
  const st=await fs.lstat(file);if(st.isSymbolicLink()||!st.isFile())throw new Error(`${label}: arquivo deve ser regular e não symlink`)
}
async function assertProjectStateBoundary(root:string,create=false){
  const realRoot=await fs.realpath(root)
  const ai=path.join(root,".ai")
  if(create && !(await exists(ai))) await fs.mkdir(ai,{recursive:false,mode:0o700})
  if(!(await exists(ai))) return {realRoot,aiReal:null}
  const st=await fs.lstat(ai);if(st.isSymbolicLink())throw new Error("CAPABILITY_BLOCKED: .ai não pode ser symlink")
  const aiReal=await fs.realpath(ai);if(!inside(realRoot,aiReal))throw new Error("CAPABILITY_BLOCKED: .ai resolve para fora do project root")
  return {realRoot,aiReal}
}
function safeContainerPath(value:string,label:string) { if(!/^\/[A-Za-z0-9._\/-]+$/.test(value) || value.includes("..")) throw new Error(`PROJECT_CHECK_BLOCKED: ${label} inválido`); return value }
function safeImageRef(value:string) { if(!/^[A-Za-z0-9][A-Za-z0-9._\/:@-]*$/.test(value)) throw new Error("CAPABILITY_BLOCKED: image reference inválida"); return value }
function safeNetwork(value:string) { if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) || value.toLowerCase()==="host" || value.toLowerCase().startsWith("container")) throw new Error("PROJECT_CHECK_BLOCKED: network inválida"); return value }
function relativeLiteralPath(root:string,value:string) {
  const resolved=safeFile(root,value); const rel=path.relative(root,resolved)
  if(!rel || rel===".") throw new Error("VCS_BLOCKED: stage exige paths explícitos; project root não é aceito")
  return rel
}
function secretLikeText(value:string){
  for(const re of SENSITIVE_TEXT_PATTERNS){re.lastIndex=0;if(re.test(value)){re.lastIndex=0;return true}re.lastIndex=0}
  return false
}
function assertNoSecretOutbound(label:string,...values:any[]){for(const value of values){if(value==null)continue;const text=typeof value==="string"?value:JSON.stringify(value);if(secretLikeText(text))throw new Error(`${label}: high-confidence secret-like material blocked`)}}
async function readJson(file:string):Promise<Json>{
  const st=await fs.stat(file);if(st.size>MAX_JSON_BYTES)throw new Error(`JSON_TOO_LARGE: ${path.basename(file)} bytes=${st.size}`)
  return JSON.parse(await fs.readFile(file,"utf8"))
}
async function writeJsonAtomic(file:string,value:Json){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp-${crypto.randomUUID()}`
  const h=await fs.open(tmp,"wx",0o600);try{await h.writeFile(JSON.stringify(value,null,2)+"\n","utf8");await h.sync()}finally{await h.close()};await fs.rename(tmp,file)
}
async function exists(file:string){try{await fs.access(file);return true}catch{return false}}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
function processAlive(pid:number){if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true}catch{return false}}
async function withFileLock<T>(lock:string,timeoutMs:number,fn:()=>Promise<T>):Promise<T>{
  const token=crypto.randomUUID(),started=Date.now();let handle:any
  while(Date.now()-started<timeoutMs){
    try{handle=await fs.open(lock,"wx",0o600);await handle.writeFile(JSON.stringify({pid:process.pid,token,at:now()})+"\n");break}
    catch(e:any){if(e?.code!=="EEXIST")throw e;try{const raw=JSON.parse(await fs.readFile(lock,"utf8")),st=await fs.stat(lock);if(Date.now()-st.mtimeMs>120000&&!processAlive(Number(raw?.pid))){await fs.unlink(lock);continue}}catch{};await sleep(50)}
  }
  if(!handle)throw new Error(`STATE_BLOCKED: lock timeout ${path.basename(lock)}`)
  try{return await fn()}finally{try{await handle.close()}catch{};try{const raw=JSON.parse(await fs.readFile(lock,"utf8"));if(raw?.token===token)await fs.unlink(lock)}catch{}}
}
async function rotateLogIfNeeded(file:string,incomingBytes:number){
  const cfg=LOG_LIMITS[path.basename(file)];if(!cfg)return;let size=0;try{size=(await fs.stat(file)).size}catch{}
  if(size+incomingBytes<=cfg.maxBytes)return
  for(let i=cfg.backups-1;i>=1;i--){const src=`${file}.${i}`,dst=`${file}.${i+1}`;if(await exists(src)){try{await fs.rename(src,dst)}catch{}}}
  if(await exists(file)){try{await fs.rename(file,`${file}.1`)}catch{}}
}
async function appendJsonl(file:string,value:Json){
  const line=JSON.stringify(value)+"\n",bytes=Buffer.byteLength(line,"utf8");if(bytes>128000)throw new Error(`LOG_RECORD_TOO_LARGE: ${path.basename(file)} bytes=${bytes}`)
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await withFileLock(`${file}.append.lock`,10000,async()=>{await assertRegularNoSymlink(file,`LOG_UNSAFE ${path.basename(file)}`);await rotateLogIfNeeded(file,bytes);const h=await fs.open(file,"a",0o600);try{await h.writeFile(line,"utf8");await h.sync()}finally{await h.close()}})
}
async function writeTextAtomic(file:string,content:string){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp-${crypto.randomUUID()}`;const h=await fs.open(tmp,"wx",0o600);try{await h.writeFile(content,"utf8");await h.sync()}finally{await h.close()};await fs.rename(tmp,file)
}
function parseInitRequest(prompt:any){
  const text=typeof prompt?.text==="string"?prompt.text:typeof prompt==="string"?prompt:"",tokens=text.trim().split(/\s+/).filter(Boolean)
  const workItem=(tokens.find((x:string)=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(x)&&!/^(LEAN|STANDARD|HIGH_ASSURANCE)$/i.test(x))||"WORK-001")
  const requested=tokens.find((x:string)=>/^(LEAN|STANDARD|HIGH_ASSURANCE)$/i.test(x));return {workItem,profile:(requested||"STANDARD").toUpperCase() as "LEAN"|"STANDARD"|"HIGH_ASSURANCE"}
}
async function initProject(root:string,pluginRoot:string,workItem:string,profile:"LEAN"|"STANDARD"|"HIGH_ASSURANCE"){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(workItem))throw new Error("ADE_INIT_BLOCKED: work item id inválido")
  await assertProjectStateBoundary(root,true);const ai=path.join(root,".ai"),templates=path.join(pluginRoot,"assets","project-templates"),timestamp=now();if(!(await exists(templates)))throw new Error("ADE_INIT_BLOCKED: project templates ausentes no plugin")
  const created:string[]=[],preserved:string[]=[];const names=["product-contract.md","delivery-contract.md","engineering-contract.md","checkpoint.md","decision-log.md","execution-policy.md","execution-policy.json","control.json","integrations.json","traceability.json","vcs-policy.json","tracker-policy.json"]
  for(const name of names){const src=path.join(templates,name),dst=path.join(ai,name);if(await exists(dst)){const st=await fs.lstat(dst);if(st.isSymbolicLink())throw new Error(`ADE_INIT_BLOCKED: ${name} não pode ser symlink`);preserved.push(name);continue}if(!(await exists(src)))throw new Error(`ADE_INIT_BLOCKED: template ausente ${name}`);let content=await fs.readFile(src,"utf8");content=content.replaceAll("{{WORK_ITEM_ID}}",workItem).replaceAll("{{TIMESTAMP}}",timestamp);if(name==="control.json"){const obj=JSON.parse(content);obj.work_item_id=workItem;obj.profile=profile;obj.updated_at=timestamp;if(profile==="LEAN"){obj.product.required=false;obj.delivery.required=false}content=JSON.stringify(obj,null,2)+"\n"}await writeTextAtomic(dst,content);created.push(name)}
  for(const dir of ["work-items","delegations"]){const d=path.join(ai,dir);if(!(await exists(d))){await fs.mkdir(d,{recursive:false,mode:0o700});created.push(`${dir}/`)}else preserved.push(`${dir}/`)}
  for(const logName of ["audit.jsonl","evidence.jsonl","telemetry.jsonl","handoffs.jsonl"]){const log=path.join(ai,logName);if(!(await exists(log))){await writeTextAtomic(log,"");created.push(logName)}else preserved.push(logName)}
  return {ai,work_item_id:workItem,profile,created,preserved}
}
async function withProjectLock<T>(root:string,scope:string,fn:()=>Promise<T>):Promise<T>{await assertProjectStateBoundary(root,true);const lockDir=path.join(root,".ai","locks");await fs.mkdir(lockDir,{recursive:true,mode:0o700});return withFileLock(path.join(lockDir,`${scope}.lock`),5000,fn)}
function minimalEnv(extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{const keep=["PATH","Path","PATHEXT","SystemRoot","WINDIR","COMSPEC","HOME","USERPROFILE","TMP","TEMP","TMPDIR","LANG","LC_ALL","TERM"];const env:NodeJS.ProcessEnv={};for(const k of keep)if(process.env[k]!=null)env[k]=process.env[k];for(const [k,v] of Object.entries(extra))if(v!=null)env[k]=v;return env}
function vcsEnv():NodeJS.ProcessEnv{const extra:NodeJS.ProcessEnv={};for(const k of ["SSH_AUTH_SOCK","GIT_ASKPASS","GIT_SSH","GIT_SSH_COMMAND"])if(process.env[k]!=null)extra[k]=process.env[k];return minimalEnv(extra)}
function candidateExecutableNames(name:string){if(process.platform!=="win32")return [name];if(path.extname(name))return [name];const exts=String(process.env.PATHEXT||".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);return [name,...exts.map(e=>name+e.toLowerCase()),...exts.map(e=>name+e.toUpperCase())]}
async function resolveTrustedExecutable(executable:string,root:string){
  if(path.isAbsolute(executable)){const real=await fs.realpath(executable);if(inside(root,real))throw new Error(`EXECUTABLE_BLOCKED: trusted tool inside project ${path.basename(executable)}`);return real}
  if(executable.includes("/")||executable.includes("\\"))throw new Error("EXECUTABLE_BLOCKED: relative executable path")
  const entries=String(process.env.PATH||process.env.Path||"").split(path.delimiter).filter(Boolean);for(const entry of entries){const base=path.resolve(entry);if(inside(root,base))continue;for(const name of candidateExecutableNames(executable)){const c=path.join(base,name);try{const st=await fs.stat(c);if(st.isFile()){const real=await fs.realpath(c);if(!inside(root,real))return real}}catch{}}}throw new Error(`EXECUTABLE_NOT_FOUND: ${executable}`)
}
function run(executable:string,args:string[],options:{cwd:string,env?:NodeJS.ProcessEnv,timeout?:number,maxOutput?:number}):Promise<{code:number,stdout:string,stderr:string,truncated:boolean}>{
  return new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd:options.cwd,env:options.env||minimalEnv(),shell:false,windowsHide:true});let out="",err="",truncated=false;const cap=Math.max(1024,Math.min(Number(options.maxOutput||1000000),2000000));let settled=false;const add=(cur:string,d:any)=>{const next=cur+String(d);if(next.length>cap)truncated=true;return next.slice(0,cap)};child.stdout?.on("data",d=>out=add(out,d));child.stderr?.on("data",d=>err=add(err,d));const timer=setTimeout(()=>{if(settled)return;settled=true;try{child.kill("SIGKILL")}catch{};reject(new Error(`timeout após ${options.timeout||120000}ms`))},options.timeout||120000);child.on("error",e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e)});child.on("close",c=>{if(settled)return;settled=true;clearTimeout(timer);resolve({code:c??-1,stdout:redactSensitiveText(out,cap),stderr:redactSensitiveText(err,cap),truncated})})})
}
async function runTrusted(executable:string,args:string[],options:{cwd:string,env?:NodeJS.ProcessEnv,timeout?:number,maxOutput?:number}){const resolved=await resolveTrustedExecutable(executable,options.cwd);return run(resolved,args,{...options,env:options.env||minimalEnv()})}
async function runGit(root:string,args:string[],options:{timeout?:number,maxOutput?:number}={}){return runTrusted("git",args,{cwd:root,env:vcsEnv(),...options})}
async function commandExists(executable:string,cwd:string){try{return (await runTrusted(executable,["--version"],{cwd,timeout:5000})).code===0}catch{return false}}
async function findPowerShell(cwd:string){if(await commandExists("pwsh",cwd))return resolveTrustedExecutable("pwsh",cwd);if(await commandExists("powershell",cwd))return resolveTrustedExecutable("powershell",cwd);throw new Error("PowerShell não disponível para compatibility backend")}
async function assertNoSecretStaged(root:string){
  const r=await runGit(root,["-C",root,"diff","--cached","--name-only","-z"],{timeout:15000});if(r.code!==0)throw new Error(cleanErrorText(r.stderr||"VCS_BLOCKED: não foi possível inspecionar staged paths"));const names=r.stdout.split("\0").filter(Boolean);const blocked=names.filter(name=>SECRET_FILE.test(name.replaceAll("/",path.sep)));if(blocked.length)throw new Error(`VCS_BLOCKED: secret-like staged paths: ${blocked.map(x=>path.basename(x)).join(", ")}`)
  for(const name of names.slice(0,500)){const sr=await runGit(root,["-C",root,"cat-file","-s",`:${name}`],{timeout:5000});const size=Number(sr.stdout.trim());if(sr.code!==0||!Number.isFinite(size)||size>2000000)continue;const content=await runGit(root,["-C",root,"cat-file","blob",`:${name}`],{timeout:5000,maxOutput:2200000});if(content.code===0&&!content.stdout.includes("\0")&&secretLikeText(content.stdout))throw new Error(`VCS_BLOCKED: high-confidence secret material staged in ${path.basename(name)}`)}
}

function controlPaths(root:string) { return {
  ai:path.join(root,".ai"),
  control:path.join(root,".ai","control.json"),
  audit:path.join(root,".ai","audit.jsonl"),
  evidence:path.join(root,".ai","evidence.jsonl"),
  telemetry:path.join(root,".ai","telemetry.jsonl"),
  handoffs:path.join(root,".ai","handoffs.jsonl"),
} }
function normalizeEvidence(value:any):any[] {
  if(Array.isArray(value)) return value.filter(x=>x && typeof x==="object")
  if(value && typeof value==="object") return Object.values(value).filter(x=>x && typeof x==="object")
  return []
}
function normalizeControl(s:Json) {
  if(!s || typeof s!=="object" || Array.isArray(s)) throw new Error("CONTROL_INVALID: .ai/control.json não é objeto")
  const schema=Number(s.schema_version||0);if(!Number.isInteger(schema)||![2,3].includes(schema))throw new Error(`CONTROL_INVALID: schema_version=${String(s.schema_version)}`)
  if(schema===2){s.schema_version=3;if(!s.profile)s.profile="LEAN";if(!Array.isArray(s.recent_handoffs))s.recent_handoffs=[]}
  if(typeof s.work_item_id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s.work_item_id))throw new Error("CONTROL_INVALID: work_item_id")
  if(!["LEAN","STANDARD","HIGH_ASSURANCE"].includes(String(s.profile||"")))throw new Error("CONTROL_INVALID: profile")
  const allowed:any={product:new Set(Object.keys(PRODUCT_TRANSITIONS)),delivery:new Set(Object.keys(DELIVERY_TRANSITIONS)),engineering:new Set(Object.keys(ENGINEERING_TRANSITIONS))}
  for(const plane of ["product","delivery","engineering"]){const v=s[plane];if(!v||typeof v!=="object"||Array.isArray(v))throw new Error(`CONTROL_INVALID: ${plane}`);if(typeof v.required!=="boolean")throw new Error(`CONTROL_INVALID: ${plane}.required`);if(!allowed[plane].has(String(v.status||"")))throw new Error(`CONTROL_INVALID: ${plane}.status=${String(v.status||"")}`);const rev=Number(v.revision||0);if(!Number.isInteger(rev)||rev<0)throw new Error(`CONTROL_INVALID: ${plane}.revision`)}
  const revision=Number(s.revision||0);if(!Number.isInteger(revision)||revision<0)throw new Error("CONTROL_INVALID: revision")
  const evidence=normalizeEvidence(s.evidence);s.evidence=evidence.slice(-20);const ec=Number(s.evidence_count);s.evidence_count=Number.isInteger(ec)&&ec>=evidence.length?ec:evidence.length
  const handoffs=Array.isArray(s.recent_handoffs)?s.recent_handoffs.filter((x:any)=>x&&typeof x==="object"):[];s.recent_handoffs=handoffs.slice(-3);recomputeGlobal(s);return s
}
async function getControl(root:string) {
  await assertProjectStateBoundary(root,false);const p=controlPaths(root).control
  if(!(await exists(p))) throw new Error(".ai/control.json ausente; execute /ade-init")
  const st=await fs.lstat(p);if(st.isSymbolicLink())throw new Error("CONTROL_INVALID: control.json não pode ser symlink")
  return normalizeControl(await readJson(p))
}
async function readJsonl(file:string):Promise<any[]> {
  if(!(await exists(file))) return []
  await assertRegularNoSymlink(file,`LOG_UNSAFE ${path.basename(file)}`)
  const raw=await fs.readFile(file,"utf8")
  const out:any[]=[];let corrupt=0
  for(const line of raw.split(/\r?\n/)){ if(!line.trim()) continue; try{out.push(JSON.parse(line))}catch{corrupt++} }
  if(corrupt)throw new Error(`LOG_CORRUPT: ${path.basename(file)} invalid_records=${corrupt}`)
  return out
}
async function evidenceHistory(root:string):Promise<any[]> {
  const s=await getControl(root)
  const recent=normalizeEvidence(s.evidence)
  const logged=await readJsonl(controlPaths(root).evidence)
  const merged:any[]=[]; const seen=new Set<string>()
  for(const x of [...logged,...recent]){ const key=String(x?.id||`${x?.ts||""}|${x?.plane||""}|${x?.summary||""}`); if(seen.has(key)) continue; seen.add(key); merged.push(x) }
  return merged
}
function compactPlane(value:any){ return {required:value?.required!==false,status:String(value?.status||""),revision:Number(value?.revision||0),contract:value?.contract} }
function routingHint(s:Json){
  const p=compactPlane(s.product), d=compactPlane(s.delivery), e=compactPlane(s.engineering)
  const pDone=!p.required||p.status==="PRODUCT_ACCEPTED"
  const dDone=!d.required||d.status==="DELIVERY_ACCEPTED"
  const eDone=!e.required||e.status==="ENGINEERING_ACCEPTED"
  if(p.required && !pDone && ["DRAFT","NEEDS_HUMAN_DECISION"].includes(p.status)) return {owner:"product-owner",plane:"product",reason:`product status=${p.status}`}
  if(d.required && !dDone && ["DRAFT","NEEDS_DISCOVERY","NEEDS_DECISION","BLOCKED"].includes(d.status)) return {owner:"project-manager",plane:"delivery",reason:`delivery status=${d.status}`}
  if(e.required && !eDone) return {owner:"engineer",plane:"engineering",reason:`engineering status=${e.status}`}
  if(d.required && !dDone) return {owner:"project-manager",plane:"delivery",reason:`engineering complete; delivery status=${d.status}`}
  if(p.required && !pDone) return {owner:"product-owner",plane:"product",reason:`downstream complete; product status=${p.status}`}
  return {owner:null,plane:null,reason:"all applicable planes accepted"}
}
function compactControl(s:Json){ return {
  schema_version:Number(s.schema_version||3),work_item_id:s.work_item_id,profile:s.profile,revision:Number(s.revision||0),updated_at:s.updated_at,
  global_status:s.global_status,product:compactPlane(s.product),delivery:compactPlane(s.delivery),engineering:compactPlane(s.engineering),
  evidence_count:Number(s.evidence_count||normalizeEvidence(s.evidence).length),routing_hint:routingHint(s),handoff_advisory:handoffAdvisory(s),recent_handoffs:(Array.isArray(s.recent_handoffs)?s.recent_handoffs:[]).slice(-3),work_management:{provider:s.work_management?.provider||"none",sync_status:s.work_management?.sync_status||"NOT_CONFIGURED"}
} }
function recomputeGlobal(s:Json) {
  const ok=(plane:string, final:string)=>!s[plane]?.required || s[plane]?.status===final
  s.global_status=ok("product","PRODUCT_ACCEPTED")&&ok("delivery","DELIVERY_ACCEPTED")&&ok("engineering","ENGINEERING_ACCEPTED")?"DONE":"NOT_DONE"
}
async function hasCurrentValidation(root:string, s:Json, plane:string, revision:number, current:string){
  const match=(x:any)=>x?.plane===plane&&x?.state==="VALIDADO"&&Number(x?.plane_revision)===revision&&x?.validated_status===current
  if(normalizeEvidence(s.evidence).some(match)) return true
  const history=await evidenceHistory(root)
  return history.some(match)
}
async function transition(root:string, plane:"product"|"delivery"|"engineering", target:string, note:string, evidence:string[]) {
  return withProjectLock(root,"control",async()=>{
    const maps={product:PRODUCT_TRANSITIONS,delivery:DELIVERY_TRANSITIONS,engineering:ENGINEERING_TRANSITIONS}; const s=await getControl(root)
    const current=String(s[plane]?.status || ""); const allowed=maps[plane][current] || []
    if(!allowed.includes(target)) throw new Error(`STATE_BLOCKED: ${plane} ${current}->${target} não permitido`)
    const finals:any={product:"PRODUCT_ACCEPTED",delivery:"DELIVERY_ACCEPTED",engineering:"ENGINEERING_ACCEPTED"}
    if(target===finals[plane]){
      const revision=Number(s[plane]?.revision||0)
      if(!(await hasCurrentValidation(root,s,plane,revision,current)))throw new Error(`STATE_BLOCKED: ${target} exige evidência VALIDADO vigente do plano ${plane} (status=${current}, revision=${revision})`)
    }
    s[plane].status=target; s[plane].revision=Number(s[plane].revision || 0)+1; s.revision=Number(s.revision||0)+1; s.updated_at=now(); recomputeGlobal(s)
    await writeJsonAtomic(controlPaths(root).control,s)
    await appendJsonl(controlPaths(root).audit,{ts:now(),event:"state.transition",actor:`${PLUGIN_ID}:${plane}-owner`,plane,action:`${current}->${target}`,status:"OBSERVADO",evidence_refs:evidence,note,global_status:s.global_status})
    return {plane,from:current,to:target,global_status:s.global_status,revision:s.revision}
  })
}


const HANDOFF_STATUS=new Set(["DONE","PARTIAL","BLOCKED","FAILED"])
const HANDOFF_OWNERS=new Set(["none","orchestrator","product-owner","project-manager","engineer"])
const HANDOFF_OWNER_BY_AGENT:Record<string,readonly string[]>={
  "product-owner":["none","orchestrator","project-manager","engineer"],
  "project-manager":["none","orchestrator","product-owner","engineer"],
  "engineer":["none","orchestrator","product-owner","project-manager"],
  "tracker-operator":["none","project-manager","orchestrator"],
  "vcs-operator":["none","engineer","orchestrator"],
  "explorer":["none","engineer","orchestrator","project-manager"],
  "researcher":["none","engineer","orchestrator"],"modeler":["none","engineer","orchestrator"],
  "engineering-planner":["none","engineer","orchestrator"],"tester":["none","engineer","orchestrator"],
  "implementer":["none","engineer","orchestrator"],"verifier":["none","engineer","orchestrator"],
  "debugger":["none","engineer","orchestrator"],"reviewer":["none","engineer","orchestrator"],
  "security-reviewer":["none","engineer","orchestrator"],"integrator":["none","engineer","orchestrator"],
  "documenter":["none","engineer","orchestrator"]
}
function cleanStrings(value:any,maxItems:number,maxChars:number,label:string){
  const list=Array.isArray(value)?value:[]
  if(list.length>maxItems)throw new Error(`HANDOFF_SCHEMA_VIOLATION: ${label} max_items=${maxItems}`)
  return list.map((x:any)=>{const v=String(x||"").trim();if(!v)throw new Error(`HANDOFF_SCHEMA_VIOLATION: ${label} item vazio`);if(v.length>maxChars)throw new Error(`HANDOFF_SCHEMA_VIOLATION: ${label} max_chars=${maxChars}`);if(secretLikeText(v))throw new Error(`HANDOFF_SCHEMA_VIOLATION: ${label} contém material sensível`);return v})
}
function compactHandoff(h:any){return {id:h.id,ts:h.ts,source_agent:h.source_agent,origin:h.origin||"agent",status:h.status,required_owner:h.required_owner,...(h.blocker?{blocker:String(h.blocker).slice(0,300)}:{}),...(h.next?{next:String(h.next).slice(0,200)}:{}),evidence_refs:(Array.isArray(h.evidence_refs)?h.evidence_refs:[]).slice(0,4)}}
function handoffAdvisory(s:Json){const state=routingHint(s),recent=Array.isArray(s.recent_handoffs)?s.recent_handoffs:[],h=recent.length?recent[recent.length-1]:null;if(!h||!h.required_owner||h.required_owner==="none")return {state_owner:state.owner,requested_owner:null,aligned:true,decision:"STATE_ONLY"};const requested=String(h.required_owner);return {state_owner:state.owner,requested_owner:requested,source_agent:h.source_agent,handoff_status:h.status,aligned:state.owner===requested,decision:state.owner===requested?"ALIGNED":"STATE_PRECEDENCE"}}
async function submitHandoff(root:string,input:Json,sourceAgent:string,sessionID:string,origin:"agent"|"runtime"="agent",operation?:string){
  if(sourceAgent==="orchestrator"||!HANDOFF_OWNER_BY_AGENT[sourceAgent])throw new Error(`HANDOFF_BLOCKED: source_agent=${sourceAgent}`)
  const status=String(input.status||"");if(!HANDOFF_STATUS.has(status))throw new Error(`HANDOFF_SCHEMA_VIOLATION: status=${status}`)
  const requiredOwner=String(input.required_owner||"none");if(!HANDOFF_OWNERS.has(requiredOwner))throw new Error(`HANDOFF_SCHEMA_VIOLATION: required_owner=${requiredOwner}`)
  if(!HANDOFF_OWNER_BY_AGENT[sourceAgent].includes(requiredOwner))throw new Error(`HANDOFF_AUTHORITY_VIOLATION: ${sourceAgent}->${requiredOwner}`)
  const changed=cleanStrings(input.changed,8,180,"changed"), evidenceRefs=cleanStrings(input.evidence_refs,8,240,"evidence_refs")
  const blocker=String(input.blocker||"").trim(), next=String(input.next||"").trim()
  if(blocker.length>800)throw new Error("HANDOFF_SCHEMA_VIOLATION: blocker max_chars=800")
  if(next.length>500)throw new Error("HANDOFF_SCHEMA_VIOLATION: next max_chars=500")
  if(secretLikeText(blocker)||secretLikeText(next))throw new Error("HANDOFF_SCHEMA_VIOLATION: material sensível detectado")
  if(status==="BLOCKED"&&!blocker)throw new Error("HANDOFF_SCHEMA_VIOLATION: BLOCKED exige blocker")
  const control=await getControl(root)
  const handoff={id:`ho-${crypto.randomUUID()}`,ts:now(),source_agent:sourceAgent,origin,session_ref:crypto.createHash("sha256").update(sessionID).digest("hex").slice(0,16),work_item_id:control.work_item_id||null,control_revision:Number(control.revision||0),status,changed,evidence_refs:evidenceRefs,...(blocker?{blocker}:{}),required_owner:requiredOwner,...(next?{next}:{}),...(operation?{operation}:{}),schema_version:1}
  const bytes=new TextEncoder().encode(JSON.stringify(handoff)).length;if(bytes>4096)throw new Error(`HANDOFF_SCHEMA_VIOLATION: max_bytes=4096 actual=${bytes}`)
  return withProjectLock(root,"control",async()=>{
    const s=await getControl(root);const recent=Array.isArray(s.recent_handoffs)?s.recent_handoffs:[]
    s.recent_handoffs=[...recent,compactHandoff(handoff)].slice(-3)
    await writeJsonAtomic(controlPaths(root).control,s);await appendJsonl(controlPaths(root).handoffs,handoff)
    await appendJsonl(controlPaths(root).audit,{ts:handoff.ts,event:"handoff.submit",actor:sourceAgent,origin,status:"OBSERVADO",handoff_id:handoff.id,handoff_status:status,required_owner:requiredOwner,evidence_refs:evidenceRefs,...(operation?{operation}:{})})
    return {...handoff,canonical:true,bytes}
  })
}

function normalizedFailureSignature(event:any){
  const type=String(event?.error?.type||"unknown").toLowerCase()
  const message=String(event?.error?.message||"").toLowerCase()
  if(/tool[_ ]choice/.test(message)&&/only[^\n]*auto/.test(message))return `${type}:tool_choice:auto-only`
  if(/reasoning item expired/.test(message))return `${type}:reasoning-item-expired`
  const normalized=message.replace(/[0-9a-f]{8,}/g,"<id>").replace(/\b\d+\b/g,"<n>").replace(/\s+/g," ").trim().slice(0,240)
  return `${type}:${crypto.createHash("sha256").update(normalized).digest("hex").slice(0,16)}`
}
function classifyFailureDomain(event:any){
  const type=String(event?.error?.type||"").toLowerCase(), message=String(event?.error?.message||"").toLowerCase()
  if(type.startsWith("provider.")||/tool[_ ]choice|reasoning item expired|rate.?limit|429/.test(message))return "PROVIDER_OR_OPENCODE_RUNTIME"
  if(/auth|unauthoriz|forbidden|credential|token/.test(message))return "AUTH"
  if(/permission|denied/.test(message))return "PERMISSION"
  return "UNKNOWN"
}

function estimateContext(event:any){
  let chars=0;try{chars+=JSON.stringify(event.system||[]).length}catch{};try{chars+=JSON.stringify(event.messages||[]).length}catch{};try{chars+=JSON.stringify(Object.keys(event.tools||{})).length}catch{}
  return {approx_context_chars:chars,approx_context_tokens:Math.ceil(chars/4),message_count:Array.isArray(event.messages)?event.messages.length:0,tool_count:Object.keys(event.tools||{}).length}
}
function usageCandidate(value:any){
  if(!value||typeof value!=="object")return null
  const candidates=[value.usage,value.info?.usage,value.tokens,value.info?.tokens]
  for(const c of candidates){if(c&&typeof c==="object")return c}
  return null
}
function exactUsageFromMessages(messages:any[]){
  let input=0,output=0,cacheRead=0,cacheWrite=0,cost=0,found=false,costFound=false
  const num=(o:any,keys:string[])=>{for(const k of keys){const v=Number(o?.[k]);if(Number.isFinite(v))return v}return 0}
  for(const m of messages||[]){const u=usageCandidate(m);if(u){found=true;input+=num(u,["input","inputTokens","input_tokens","promptTokens","prompt_tokens"]);output+=num(u,["output","outputTokens","output_tokens","completionTokens","completion_tokens"]);cacheRead+=num(u,["cacheRead","cache_read","cacheReadTokens","cache_read_tokens"]);cacheWrite+=num(u,["cacheWrite","cache_write","cacheWriteTokens","cache_write_tokens"])}const c=Number(m?.cost??m?.info?.cost);if(Number.isFinite(c)){cost+=c;costFound=true}}
  return {available:found,input_tokens:input,output_tokens:output,cache_read_tokens:cacheRead,cache_write_tokens:cacheWrite,cost_available:costFound,cost}
}
function sessionActivity(messages:any[]){let subagent_calls=0,skill_calls=0,handoff_calls=0,assistant_text_chars=0;for(const m of messages||[]){const content=Array.isArray(m?.content)?m.content:Array.isArray(m?.parts)?m.parts:[];for(const e of content){if(!e||typeof e!=="object")continue;if(e.type==="tool"){const name=String(e.name||e.tool||"");if(name==="subagent")subagent_calls++;if(name==="skill")skill_calls++;if(name==="ade_handoff_submit")handoff_calls++}if(e.type==="text"&&typeof e.text==="string")assistant_text_chars+=e.text.length}}return {subagent_calls,skill_calls,handoff_calls,assistant_text_chars}}

async function persistEvidence(root:string,s:Json,ev:any,auditEvent:string){
  const list=normalizeEvidence(s.evidence)
  list.push(ev)
  s.evidence=list.slice(-20)
  s.evidence_count=Number(s.evidence_count||0)+1
  s.updated_at=now(); s.revision=Number(s.revision||0)+1
  await writeJsonAtomic(controlPaths(root).control,s)
  await appendJsonl(controlPaths(root).evidence,ev)
  await appendJsonl(controlPaths(root).audit,{ts:ev.ts,event:auditEvent,actor:PLUGIN_ID,plane:ev.plane,status:ev.state,plane_revision:ev.plane_revision,validated_status:ev.validated_status,evidence_refs:ev.refs,summary:ev.summary})
}
async function recordEvidence(root:string,input:Json,fixed?:{plane:string,state:string}) {
  return withProjectLock(root,"control",async()=>{
    const s=await getControl(root)
    const summary=String(input.summary||"").trim();if(!summary||summary.length>1200||secretLikeText(summary))throw new Error("EVIDENCE_SCHEMA_VIOLATION: summary")
    const refs=cleanStrings(input.refs,16,512,"evidence.refs")
    const ev={id:`ev-${crypto.randomUUID()}`,ts:now(),state:fixed?.state||input.state,plane:fixed?.plane||input.plane,summary,refs,source:"opencode-plugin"}
    await persistEvidence(root,s,ev,"evidence.record")
    return ev
  })
}

async function recordPlaneValidation(root:string,input:Json,plane:"product"|"delivery"|"engineering",allowedStatuses:readonly string[]) {
  return withProjectLock(root,"control",async()=>{
    const s=await getControl(root); const current=String(s[plane]?.status||""); const revision=Number(s[plane]?.revision||0)
    if(!allowedStatuses.includes(current))throw new Error(`VALIDATION_BLOCKED: ${plane} não pode registrar VALIDADO em status=${current}`)
    const summary=String(input.summary||"").trim();if(!summary||summary.length>1200||secretLikeText(summary))throw new Error("EVIDENCE_SCHEMA_VIOLATION: summary")
    const refs=cleanStrings(input.refs,16,512,"validation.refs")
    const ev={id:`ev-${crypto.randomUUID()}`,ts:now(),state:"VALIDADO",plane,summary,refs,source:"opencode-plugin",plane_revision:revision,validated_status:current}
    await persistEvidence(root,s,ev,"evidence.validation")
    return ev
  })
}

function credentialCandidates(value:any,depth=0):string[]{
  if(depth>4||value==null)return [];if(typeof value==="string")return depth===0&&value.trim()?[value.trim()]:[];if(typeof value!=="object")return []
  const keys=["token","accessToken","access_token","apiToken","api_token"],out:string[]=[];for(const key of keys){const v=value[key];if(typeof v==="string"&&v.trim())out.push(v.trim())}
  for(const [k,v] of Object.entries(value)){if(keys.includes(k))continue;if(v&&typeof v==="object")out.push(...credentialCandidates(v,depth+1))}return [...new Set(out)]
}
async function integrationSecret(ctx:any,id:string):Promise<string|undefined>{
  try{const c=await ctx.integration.connection.active(id);if(!c)return undefined;const candidates=credentialCandidates(await ctx.integration.connection.resolve(c));if(candidates.length>1)throw new Error("INTEGRATION_AUTH_AMBIGUOUS");return candidates[0]}catch(e){if(asError(e).includes("AMBIGUOUS"))throw e;return undefined}
}

async function nativeProjectCheck(root:string,name:string,expectedOwner:"verifier"|"debugger"="verifier",validationAuthority=true,preSideEffect?:()=>Promise<void>) {
  const policyPath=path.join(root,".ai","execution-policy.json")
  if(!(await exists(policyPath))) throw new Error(`PROJECT_CHECK_BLOCKED: execution policy ausente; project_root=${root}; policy=.ai/execution-policy.json`)
  const policy=await readProjectJson(root,".ai/execution-policy.json","execution policy")
  const availableChecks=Object.keys(policy.checks||{}).sort()
  if(policy.authorized!==true) throw new Error(`PROJECT_CHECK_BLOCKED: policy authorized=false; project_root=${root}; policy=.ai/execution-policy.json; requested=${name}; available=[${availableChecks.join(",")}]`)
  const c=policy.checks?.[name]; if(!c) throw new Error(`PROJECT_CHECK_BLOCKED: check '${name}' ausente; project_root=${root}; policy=.ai/execution-policy.json; available=[${availableChecks.join(",")}]`)
  if(c.owner!==expectedOwner || c.non_destructive!==true) throw new Error(`PROJECT_CHECK_BLOCKED: owner/non_destructive inválido; expected=${expectedOwner} actual=${String(c.owner||"")}`)
  const allowed=Array.isArray(c.allowed_exit_codes)?c.allowed_exit_codes.map(Number):[0]
  if(!allowed.length||allowed.length>16||allowed.some((x:any)=>!Number.isInteger(x)||x<0||x>255))throw new Error("PROJECT_CHECK_BLOCKED: allowed_exit_codes inválido")
  if(c.runner==="process") {
    if(c.allow_host_process!==true)throw new Error("PROJECT_CHECK_BLOCKED: process runner exige allow_host_process=true; prefira docker sandbox")
    const cwd=await safeExistingRealPath(root,String(c.working_directory || "."),"working_directory"); const cwdStat=await fs.stat(cwd); if(!cwdStat.isDirectory()) throw new Error("PROJECT_CHECK_BLOCKED: working_directory não é diretório")
    let exe=String(c.executable||""); if(!exe) throw new Error("PROJECT_CHECK_BLOCKED: executable ausente")
    const blockedExecutables=new Set(["pwsh","pwsh.exe","powershell","powershell.exe","cmd","cmd.exe","bash","sh","zsh","fish","wsl","docker","podman","git"])
    if(blockedExecutables.has(path.basename(exe).toLowerCase())) throw new Error(`PROJECT_CHECK_BLOCKED: executable genérico/bypass proibido: ${exe}`)
    if(path.isAbsolute(exe)||exe.includes("/")||exe.includes("\\")){const resolved=path.isAbsolute(exe)?path.resolve(exe):path.resolve(cwd,exe);if(!inside(root,resolved))throw new Error("PROJECT_CHECK_BLOCKED: executable por caminho fora do projeto");exe=await safeExistingRealPath(root,resolved,"project-check executable")}else exe=await resolveTrustedExecutable(exe,root)
    const args=Array.isArray(c.arguments)?c.arguments.map((x:any)=>String(x)):[];if(args.length>64||args.some((x:string)=>x.includes("\0")||x.length>4096)||args.reduce((n:number,x:string)=>n+x.length,0)>65536)throw new Error("PROJECT_CHECK_BLOCKED: argumentos excedem limites")
    const envNames=Array.isArray(c.environment?.allow)?c.environment.allow.map(String):[];if(envNames.length>32||envNames.some((x:string)=>!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(x)))throw new Error("PROJECT_CHECK_BLOCKED: environment.allow inválido")
    const deniedEnv=/TOKEN|SECRET|PASSWORD|PASSWD|KEY|CREDENTIAL|AUTH/i;if(c.environment?.allow_secret_environment!==true&&envNames.some((x:string)=>deniedEnv.test(x)))throw new Error("PROJECT_CHECK_BLOCKED: secret environment exige allow_secret_environment=true")
    const extra:any={};for(const k of envNames)if(process.env[k]!=null)extra[k]=process.env[k]
    if(preSideEffect)await preSideEffect()
    const r=await run(exe,args,{cwd,env:minimalEnv(extra),timeout:Math.min(Math.max(Number(c.timeout_ms||120000),1000),300000)});if(!allowed.includes(r.code))throw new Error(`PROJECT_CHECK_FAILED exit=${r.code}
${cleanErrorText(r.stderr)}`)
    return {status:validationAuthority?"PROJECT_CHECK_VALIDATED":"DIAGNOSTIC_CHECK_COMPLETED",evidence_state:validationAuthority?"VALIDADO":"OBSERVADO",validation_authority:validationAuthority,acceptance_authority:false,owner:expectedOwner,runner:"process",exit_code:r.code,stdout:redactSensitiveText(r.stdout),stderr:redactSensitiveText(r.stderr)}
  }
  if(c.runner==="docker") {
    const mode=String(c.project_mount_mode||"ro");if(mode!=="ro"&&mode!=="rw")throw new Error("PROJECT_CHECK_BLOCKED: mount mode inválido");if(mode==="rw"&&c.allow_workspace_writes!==true)throw new Error("PROJECT_CHECK_BLOCKED: rw sem allow_workspace_writes")
    const image=safeImageRef(String(c.image||""));if(!image)throw new Error("PROJECT_CHECK_BLOCKED: image ausente");if(c.allow_mutable_image!==true&&!/@sha256:[0-9a-f]{64}$/i.test(image))throw new Error("PROJECT_CHECK_BLOCKED: docker image deve ser pinned por sha256 ou allow_mutable_image=true")
    const target=safeContainerPath(String(c.project_mount_target||"/workspace"),"mount target"),workdir=safeContainerPath(String(c.workdir||target),"workdir")
    const network=c.network?String(c.network):"none";if(network!=="none"&&c.allow_network!==true)throw new Error("PROJECT_CHECK_BLOCKED: network exige allow_network=true")
    const command=Array.isArray(c.command)?c.command.map(String):[];if(command.length>64||command.some((x:string)=>x.includes("\0")||x.length>4096))throw new Error("PROJECT_CHECK_BLOCKED: docker command inválido");if(root.includes(","))throw new Error("PROJECT_CHECK_BLOCKED: project path com vírgula não suportado pelo docker --mount")
    const memory=String(c.memory||"1g").toLowerCase();if(!/^[1-9][0-9]{0,4}(?:k|m|g)?$/.test(memory))throw new Error("PROJECT_CHECK_BLOCKED: memory inválida")
    const cpus=Number(c.cpus??2);if(!Number.isFinite(cpus)||cpus<0.1||cpus>16)throw new Error("PROJECT_CHECK_BLOCKED: cpus inválido")
    const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"ade-docker-"));try{await fs.chmod(tmp,0o700)}catch{};const cidfile=path.join(tmp,"cid")
    const args=["run","--rm","--cidfile",cidfile,"--network",safeNetwork(network),"--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--pids-limit","256","--memory",memory,"--cpus",String(cpus),"--tmpfs","/tmp:rw,noexec,nosuid,size=256m","--mount",`type=bind,source=${root},target=${target}${mode==="ro"?",readonly":""}`,"-w",workdir,image,...command]
    let r:{code:number,stdout:string,stderr:string}|undefined
    if(preSideEffect)await preSideEffect()
    try{r=await runTrusted("docker",args,{cwd:root,timeout:Math.min(Math.max(Number(c.timeout_ms||180000),1000),300000)})}
    finally{try{const cid=(await fs.readFile(cidfile,"utf8")).trim();if(/^[0-9a-f]{12,64}$/i.test(cid))await runTrusted("docker",["rm","-f",cid],{cwd:root,timeout:15000})}catch{};try{await fs.rm(tmp,{recursive:true,force:true})}catch{}}
    if(!r)throw new Error("PROJECT_CHECK_FAILED: docker não retornou resultado");if(!allowed.includes(r.code))throw new Error(`PROJECT_CHECK_FAILED exit=${r.code}
${cleanErrorText(r.stderr)}`)
    return {status:validationAuthority?"PROJECT_CHECK_VALIDATED":"DIAGNOSTIC_CHECK_COMPLETED",evidence_state:validationAuthority?"VALIDADO":"OBSERVADO",validation_authority:validationAuthority,acceptance_authority:false,owner:expectedOwner,runner:"docker",exit_code:r.code,stdout:redactSensitiveText(r.stdout),stderr:redactSensitiveText(r.stderr),network,read_only_root:true,container_cleanup:true}
  }
  throw new Error(`PROJECT_CHECK_BLOCKED: runner '${c.runner}' não suportado`)
}

async function vcsPolicy(root:string) {
  const p=path.join(root,".ai","vcs-policy.json"); if(!(await exists(p))) throw new Error("VCS_BLOCKED: .ai/vcs-policy.json ausente")
  const v=await readProjectJson(root,".ai/vcs-policy.json","vcs policy"); if(v.authorized!==true) throw new Error("VCS_BLOCKED: policy authorized=false"); return v
}
async function currentBranch(root:string) { const r=await runGit(root,["-C",root,"rev-parse","--abbrev-ref","HEAD"]); if(r.code!==0) throw new Error(cleanErrorText(r.stderr||"git branch failed")); return r.stdout.trim() }
function protectedBranch(policy:Json,branch:string) { const list=policy.protected_branches || ["main","master"]; return Array.isArray(list) && list.includes(branch) }
async function assertPushRemoteAllowed(root:string,policy:any,remote:string){const allowed=Array.isArray(policy.push?.allowed_remote_urls)?policy.push.allowed_remote_urls.map(String):[];if(!allowed.length)throw new Error("VCS_BLOCKED: push.allowed_remote_urls vazio");const r=await runGit(root,["-C",root,"remote","get-url",remote],{timeout:10000});if(r.code!==0)throw new Error("VCS_BLOCKED: remote URL indisponível");const url=r.stdout.trim();if(!allowed.includes(url))throw new Error(`VCS_BLOCKED: remote URL não autorizado: ${url}`);return url}
function assertPullRequestRepositoryAllowed(policy:any,owner:string,repo:string){const allowed=Array.isArray(policy.pull_request?.allowed_repositories)?policy.pull_request.allowed_repositories.map((x:any)=>String(x).toLowerCase()):[];if(!allowed.includes(`${owner}/${repo}`.toLowerCase()))throw new Error(`VCS_BLOCKED: repository ${owner}/${repo} não autorizado em pull_request.allowed_repositories`)}

// OpenCode V2 native Promise plugin contract. Local plugins are expected to import
// Plugin.define from the host SDK; this keeps the plugin aligned with the runtime loader.
export default pluginDefine({
  id: PLUGIN_ID,
  async setup(ctx: any) {
    const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
    const capabilityRegistry=await readJson(path.join(pluginRoot,"capabilities.json"))
    const agentTools: Record<string, readonly string[]> = capabilityRegistry.agents || {}
    const hideCore: Record<string, readonly string[]> = capabilityRegistry.hide_core_tools || {}
    const registered = Object.keys(capabilityRegistry.tools || {})
    const retrySignatures=new Map<string,number>()
    await ctx.storage.set("runtime/version",{plugin:VERSION,opencode:ctx.app?.version,plugin_contract:PLUGIN_CONTRACT,loaded_at:now()})

    await ctx.agent.transform((draft:any)=>{
      if(draft.get("orchestrator")) draft.default("orchestrator")
      for(const id of Object.keys(agentTools)) { const a=draft.get(id); if(a) draft.update(id,(agent:any)=>{ agent.description = `${agent.description || id} [ADE v${VERSION} native capabilities]` }) }
    })

    const generationBudgets:Record<string,number>=capabilityRegistry.generation_max_tokens || {}
    await ctx.session.hook("context",async(event:any)=>{
      const allowed=new Set(agentTools[event.agent] || [])
      for(const name of Object.keys(event.tools || {})) if(name.startsWith(TOOL_PREFIX) && !allowed.has(name)) delete event.tools[name]
      for(const name of hideCore[event.agent] || []) delete event.tools[name]
      const budget=Number(generationBudgets[event.agent]||0); if(budget>0) event.generation.maxTokens=budget
      try { const scope=await resolveSessionScope(ctx,String(event.sessionID||"")); if(await exists(controlPaths(scope.root).control)){ const est=estimateContext(event); await appendJsonl(controlPaths(scope.root).telemetry,{ts:now(),kind:"model.dispatch",session_ref:crypto.createHash("sha256").update(String(event.sessionID||"")).digest("hex").slice(0,16),agent:String(event.agent||"unknown"),provider:String(event.model?.providerID||""),model:String(event.model?.id||event.model?.modelID||""),generation_budget:budget,...est}) } } catch {}
    })

    const autoOnlyToolChoiceModels:readonly string[] = Array.isArray(capabilityRegistry.provider_compat?.auto_only_tool_choice_models)
      ? capabilityRegistry.provider_compat.auto_only_tool_choice_models.map((x:any)=>String(x).toLowerCase())
      : []
    await ctx.session.hook("http.request",async(event:any)=>{
      // Compatibility shim for specific OpenCode Zen free models whose upstream accepts only tool_choice=auto.
      // Preserve `none` semantics by removing tools entirely; never rewrite requests for unknown models/providers.
      try{
        const request=event?.request
        if(!request||typeof request.clone!=="function")return
        const contentType=String(request.headers?.get?.("content-type")||"").toLowerCase()
        if(!contentType.includes("application/json"))return
        const clone=request.clone(),raw=await clone.text()
        if(Buffer.byteLength(raw,"utf8")>2_000_000)return
        let body:any;try{body=JSON.parse(raw)}catch{return}
        if(!body||typeof body!=="object"||Array.isArray(body))return
        const model=String(event?.model?.id||event?.model?.modelID||body.model||"").toLowerCase()
        const provider=String(event?.model?.providerID||event?.providerID||"").toLowerCase()
        let host="";try{host=new URL(String(request.url||"")).hostname.toLowerCase()}catch{}
        const knownModel=autoOnlyToolChoiceModels.some((x:string)=>model===x||model.endsWith(`/`+x)||model.includes(x))
        const knownZen=(provider==="opencode"||provider==="console"||host==="opencode.ai")&&knownModel
        if(!knownZen)return
        const hasSnake=Object.prototype.hasOwnProperty.call(body,"tool_choice"),hasCamel=Object.prototype.hasOwnProperty.call(body,"toolChoice")
        if(!hasSnake&&!hasCamel)return
        const current=hasSnake?body.tool_choice:body.toolChoice
        if(current==="auto")return
        let mode=""
        const isNone=current==="none"||(current&&typeof current==="object"&&String(current.type||"").toLowerCase()==="none")
        if(isNone){
          delete body.tool_choice;delete body.toolChoice;delete body.tools
          mode="none->tools-omitted"
        }else{
          body.tool_choice="auto";delete body.toolChoice
          mode="required-or-named->auto"
        }
        const headers=new Headers(request.headers);headers.delete("content-length")
        event.request=new Request(request,{headers,body:JSON.stringify(body)})
        try{const scope=await resolveSessionScope(ctx,String(event.sessionID||""));if(await exists(controlPaths(scope.root).control))await appendJsonl(controlPaths(scope.root).telemetry,{ts:now(),kind:"provider.compat.tool_choice",session_ref:crypto.createHash("sha256").update(String(event.sessionID||"")).digest("hex").slice(0,16),agent:String(event.agent||"unknown"),provider,model,mode})}catch{}
      }catch{
        // Compatibility normalization is best-effort. Never corrupt or block an otherwise valid provider request.
      }
    })

    await ctx.session.hook("retry",async(event:any)=>{
      const signature=normalizedFailureSignature(event)
      const key=`${String(event.sessionID||"")}|${String(event.agent||"")}|${String(event.model?.providerID||"")}|${String(event.model?.id||event.model?.modelID||"")}|${signature}`
      const seen=retrySignatures.get(key)||0
      const message=String(event.error?.message||"")
      const autoOnly=event.error?.type==="provider.invalid-request" && /tool[_ ]choice/i.test(message) && /only[^\n]*auto/i.test(message)
      const reasoningExpired=/reasoning item expired/i.test(message)
      // Deterministic incompatibility: never retry the same malformed request. Transient expiry: one retry per exact signature/session.
      if(autoOnly) event.decision={retry:false}
      else if(reasoningExpired && seen===0) event.decision={retry:true,delay:400}
      else if(reasoningExpired && seen>0) event.decision={retry:false}
      if(autoOnly||reasoningExpired) retrySignatures.set(key,seen+1)
      try { const scope=await resolveSessionScope(ctx,String(event.sessionID||"")); if(await exists(controlPaths(scope.root).control)){ await appendJsonl(controlPaths(scope.root).telemetry,{ts:now(),kind:"provider.retry",session_ref:crypto.createHash("sha256").update(String(event.sessionID||"")).digest("hex").slice(0,16),agent:String(event.agent||"unknown"),provider:String(event.model?.providerID||""),model:String(event.model?.id||event.model?.modelID||""),attempt:Number(event.attempt||0),failure_signature:signature,failure_domain:classifyFailureDomain(event),seen_signature:seen,retry:Boolean(event.decision?.retry),delay_ms:event.decision?.retry?Number(event.decision?.delay||0):0}) } } catch {}
    })

    const HUMAN_AUTHORIZATION_REQUIRED = new Set(["ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"])
    await ctx.permission.hook("evaluate",(event:any)=>{
      const agent=String(event.agent||""); const allowed=new Set(agentTools[agent] || [])
      if((event.resources||[]).some((r:any)=>resourceTouchesGrantStore(r))){event.effect="deny";event.message="ADE_CAPABILITY_DENIED: authorization grant store is outside agent authority";return}
      if(agentTools[agent] && event.action==="read" && (event.resources||[]).some((r:any)=>SECRET_FILE.test(String(r).replaceAll("\\",path.sep))||SENSITIVE_RESOURCE.test(String(r).replaceAll("\\",path.sep)))){event.effect="deny";event.message="ADE_CAPABILITY_DENIED: sensitive path boundary";return}
      if(String(event.action).startsWith(TOOL_PREFIX) && !allowed.has(String(event.action))) { event.effect="deny"; event.message=`ADE_CAPABILITY_DENIED: ${agent} não possui ${event.action}`; return }
      if((hideCore[agent] || []).includes("shell") && event.action==="shell") { event.effect="deny"; event.message=`ADE_CAPABILITY_DENIED: raw shell não pertence a ${agent}`; return }
      if(HUMAN_AUTHORIZATION_REQUIRED.has(String(event.action))){
        if(event.effect!=="deny"){
          event.effect="ask"
          event.message=`ADE_HUMAN_AUTHORIZATION_REQUIRED: ${event.action} é high-impact; repo policy e OpenCode ask/allow não bastam. --auto pode autoaprovar ask (AUTO_APPROVED), mas isso não satisfaz esta barreira. O side effect exige EXPLICIT_EXTERNAL_GRANT single-use emitido via /ade-authorize para o efeito exato.`
        }
        return
      }
    })


    const transitionWithRuntimeHandoff=async(i:any,t:any,plane:"product"|"delivery"|"engineering")=>{
      const root=projectRoot(ctx,i);const value=await transition(root,plane,i.target,i.note||"",i.evidence||[])
      const source=String(t?.agent||`${plane}-owner`), sessionID=String(t?.sessionID||"")
      const handoff=await submitHandoff(root,{status:String(i.target||"").endsWith("_ACCEPTED")?"DONE":"PARTIAL",changed:[`${plane} ${value.from}->${value.to}`],evidence_refs:Array.isArray(i.evidence)?i.evidence.slice(0,8):[],required_owner:"none",next:"orchestrator: read ade_route_snapshot post-operation"},source,sessionID,"runtime",`state.${plane}.transition`)
      return {...value,canonical_handoff:compactHandoff(handoff),post_state:compactControl(await getControl(root))}
    }

    const assertTrackerRemoteScope=(trackerPolicy:any,provider:string,providerCfg:any)=>{
      const remote=trackerPolicy.remote||{}
      if(provider==="github"){const owner=String(providerCfg.project_owner||providerCfg.owner||"").trim(),repo=String(providerCfg.repository||"").trim(),num=Number(providerCfg.project_number||0);if(repo){const allowed=Array.isArray(remote.allowed_github_repositories)?remote.allowed_github_repositories.map((x:any)=>String(x).toLowerCase()):[];if(!owner||!allowed.includes(`${owner}/${repo}`.toLowerCase()))throw new Error(`TRACKER_SCOPE_BLOCKED: github repository ${owner}/${repo} não autorizado`)}if(num>0){const allowed=Array.isArray(remote.allowed_github_projects)?remote.allowed_github_projects.map((x:any)=>String(x).toLowerCase()):[];if(!owner||!allowed.includes(`${owner}/${num}`.toLowerCase()))throw new Error(`TRACKER_SCOPE_BLOCKED: github project ${owner}/${num} não autorizado`)}}
      else if(provider==="jira"){let host="";try{host=new URL(String(providerCfg.base_url||"")).hostname.toLowerCase()}catch{}const key=String(providerCfg.project_key||"");const allowed=Array.isArray(remote.allowed_jira_projects)?remote.allowed_jira_projects.map((x:any)=>String(x).toLowerCase()):[];if(!host||!key||!allowed.includes(`${host}/${key}`.toLowerCase()))throw new Error(`TRACKER_SCOPE_BLOCKED: jira ${host}/${key} não autorizado`)}
      else if(provider==="linear"){const team=String(providerCfg.team_id||"");const allowed=Array.isArray(remote.allowed_linear_team_ids)?remote.allowed_linear_team_ids.map(String):[];if(!team||!allowed.includes(team))throw new Error(`TRACKER_SCOPE_BLOCKED: linear team ${team} não autorizado`)}
    }
    const trackerSettings=async(root:string,write=false)=>{
      const trackerPolicyPath=path.join(root,".ai","tracker-policy.json")
      if(!(await exists(trackerPolicyPath)))throw new Error("TRACKER_BLOCKED: .ai/tracker-policy.json ausente")
      const trackerPolicy=await readProjectJson(root,".ai/tracker-policy.json","tracker policy")
      if(write&&trackerPolicy.write?.authorized!==true)throw new Error("TRACKER_BLOCKED: tracker write unauthorized")
      if(!write&&trackerPolicy.read?.authorized!==true)throw new Error("TRACKER_BLOCKED: tracker read unauthorized")
      const cfg=await readProjectJson(root,".ai/integrations.json","integrations")
      const provider=String(cfg.work_management?.provider||"none")
      const providerCfg=cfg.work_management?.[provider]||{}
      assertTrackerRemoteScope(trackerPolicy,provider,providerCfg)
      return {trackerPolicy,cfg,provider,providerCfg}
    }
    const githubGraphql=async(token:string,query:string,variables:any)=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
      try{const response=await fetch("https://api.github.com/graphql",{method:"POST",redirect:"error",signal:controller.signal,headers:{accept:"application/vnd.github+json",authorization:`Bearer ${token}`,"content-type":"application/json","user-agent":`ade-opencode/${VERSION}`},body:JSON.stringify({query,variables})});const raw=await response.text();if(Buffer.byteLength(raw,"utf8")>5000000)throw new Error("TRACKER_REMOTE_FAILED: github response too large");let data:any={};try{data=raw?JSON.parse(raw):{}}catch{throw new Error("TRACKER_REMOTE_FAILED: github graphql invalid json")};if(!response.ok)throw new Error(`TRACKER_REMOTE_FAILED: github graphql http=${response.status} message=${cleanErrorText(data?.message||"",300)}`);if(Array.isArray(data?.errors)&&data.errors.length)throw new Error(`TRACKER_REMOTE_FAILED: github graphql ${data.errors.slice(0,5).map((x:any)=>cleanErrorText(x?.message||"unknown",240)).join("; ")}`);return data?.data||{}}finally{clearTimeout(timer)}
    }
    const githubProjectSnapshot=async(root:string)=>{
      const {provider,providerCfg}=await trackerSettings(root,false)
      if(provider!=="github")throw new Error(`TRACKER_BLOCKED: deterministic project adapter supports github; provider=${provider}`)
      const owner=String(providerCfg.project_owner||providerCfg.owner||"").trim(), number=Number(providerCfg.project_number||0)
      if(!owner||!Number.isInteger(number)||number<=0)throw new Error("TRACKER_BLOCKED: github project_owner/owner e project_number obrigatórios")
      const token=await integrationSecret(ctx,String(providerCfg.connection_id||"github")); if(!token)throw new Error("TRACKER_BLOCKED: conexão GitHub autorizada do OpenCode indisponível")
      const query=`query($login:String!,$number:Int!,$after:String){
        user(login:$login){projectV2(number:$number){...ProjectData}}
        organization(login:$login){projectV2(number:$number){...ProjectData}}
      }
      fragment ProjectData on ProjectV2{
        id title
        fields(first:100){nodes{
          ... on ProjectV2Field{id name dataType}
          ... on ProjectV2SingleSelectField{id name dataType options{id name}}
          ... on ProjectV2IterationField{id name dataType configuration{iterations{id title startDate duration}}}
        }}
        items(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id content{... on Issue{number title url} ... on PullRequest{number title url}}
          fieldValues(first:50){nodes{
            ... on ProjectV2ItemFieldSingleSelectValue{field{... on ProjectV2SingleSelectField{name}} name optionId}
            ... on ProjectV2ItemFieldIterationValue{field{... on ProjectV2IterationField{name}} title iterationId}
            ... on ProjectV2ItemFieldTextValue{field{... on ProjectV2Field{name}} text}
            ... on ProjectV2ItemFieldNumberValue{field{... on ProjectV2Field{name}} number}
            ... on ProjectV2ItemFieldDateValue{field{... on ProjectV2Field{name}} date}
          }}
        }}
      }`
      let after:string|null=null, project:any=null;const itemNodes:any[]=[]
      for(let page=0;page<10;page++){
        const data=await githubGraphql(token,query,{login:owner,number,after});const current=data?.user?.projectV2||data?.organization?.projectV2
        if(!current)throw new Error(`TRACKER_REMOTE_FAILED: GitHub Project ${owner}/${number} não encontrado ou sem acesso`)
        if(!project)project=current
        itemNodes.push(...(current.items?.nodes||[]).filter(Boolean))
        const info=current.items?.pageInfo||{};if(!info.hasNextPage){after=null;break}after=String(info.endCursor||"");if(!after)throw new Error("TRACKER_REMOTE_FAILED: pagination cursor ausente")
        if(page===9)throw new Error("TRACKER_REMOTE_FAILED: project item pagination excedeu 1000 itens")
      }
      const fields=(project.fields?.nodes||[]).filter(Boolean).map((f:any)=>({id:f.id,name:f.name,dataType:f.dataType,options:f.options||[],iterations:f.configuration?.iterations||[]}))
      const items=itemNodes.map((it:any)=>{const values:any={};for(const v of it.fieldValues?.nodes||[]){const name=String(v?.field?.name||"");if(!name)continue;values[name]=v.name??v.title??v.text??v.number??v.date??null}return {item_id:it.id,external_id:it.content?.number!=null?String(it.content.number):null,title:it.content?.title||null,url:it.content?.url||null,fields:values}})
      return {provider:"github",project:{id:project.id,owner,number,title:project.title},fields,items,token}
    }
    const githubFieldValue=(field:any,value:any)=>{
      const type=String(field.dataType||"").toUpperCase()
      if(type==="SINGLE_SELECT"){const matches=(field.options||[]).filter((x:any)=>String(x.name).toLowerCase()===String(value).toLowerCase());if(matches.length!==1)throw new Error(`TRACKER_MAPPING_FAILED: field=${field.name} option matches=${matches.length}`);return {singleSelectOptionId:matches[0].id}}
      if(type==="ITERATION"){const matches=(field.iterations||[]).filter((x:any)=>String(x.title).toLowerCase()===String(value).toLowerCase());if(matches.length!==1)throw new Error(`TRACKER_MAPPING_FAILED: field=${field.name} iteration matches=${matches.length}`);return {iterationId:matches[0].id}}
      if(type==="NUMBER"){const n=Number(value);if(!Number.isFinite(n))throw new Error(`TRACKER_MAPPING_FAILED: field=${field.name} exige número`);return {number:n}}
      if(type==="DATE"){const v=String(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error(`TRACKER_MAPPING_FAILED: field=${field.name} exige YYYY-MM-DD`);return {date:v}}
      if(type==="TEXT")return {text:String(value)}
      throw new Error(`TRACKER_MAPPING_FAILED: field=${field.name} dataType=${type} não suportado`)
    }
    const githubSetProjectField=async(token:string,projectId:string,itemId:string,field:any,fieldValue:any)=>{const mutation=`mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}){projectV2Item{id}}}`;await githubGraphql(token,mutation,{project:projectId,item:itemId,field:field.id,value:fieldValue})}
    const executeProjectSync=async(i:any,t:any)=>{
      assertNoSecretOutbound("TRACKER_OUTBOUND_BLOCKED",i.updates)
      const root=projectRoot(ctx,i);return withProjectLock(root,"tracker-sync",async()=>{await trackerSettings(root,true);const before=await githubProjectSnapshot(root),updates=Array.isArray(i.updates)?i.updates:[];if(!updates.length)throw new Error("TRACKER_SCHEMA_FAILED: updates vazio");if(updates.length>50)throw new Error("TRACKER_SCHEMA_FAILED: max updates=50")
      const fieldsByName=new Map<string,any>();for(const f of before.fields){const k=String(f.name).toLowerCase();if(fieldsByName.has(k))throw new Error(`TRACKER_MAPPING_FAILED: duplicate field name ${f.name}`);fieldsByName.set(k,f)}
      const itemsByExternal=new Map<string,any>();for(const item of before.items.filter((x:any)=>x.external_id)){const k=String(item.external_id);if(itemsByExternal.has(k))throw new Error(`TRACKER_MAPPING_FAILED: duplicate external_id ${k}`);itemsByExternal.set(k,item)}const itemsById=new Map<string,any>(before.items.map((x:any)=>[String(x.item_id),x])),requested:any[]=[],preflightFailures:any[]=[],seenTargets=new Set<string>()
      for(const u of updates){const item=(u.item_id?itemsById.get(String(u.item_id)):undefined)||(u.external_id?itemsByExternal.get(String(u.external_id)):undefined);if(!item){preflightFailures.push({external_id:u.external_id||null,item_id:u.item_id||null,error:"TRACKER_MAPPING_FAILED: item não encontrado no project"});continue}const fspec=Array.isArray(u.fields)?u.fields:[];if(!fspec.length){preflightFailures.push({external_id:item.external_id,item_id:item.item_id,error:"TRACKER_MAPPING_FAILED: fields vazio"});continue}for(const fv of fspec){const fieldName=String(fv.name||"").trim(),targetKey=`${String(item.item_id).toLowerCase()}|${fieldName.toLowerCase()}`;if(seenTargets.has(targetKey)){preflightFailures.push({external_id:item.external_id,item_id:item.item_id,field:fieldName,error:"TRACKER_SCHEMA_FAILED: duplicate item/field update"});continue}seenTargets.add(targetKey);const field=fieldsByName.get(fieldName.toLowerCase());if(!field){preflightFailures.push({external_id:item.external_id,item_id:item.item_id,field:fv.name,error:"TRACKER_MAPPING_FAILED: field não encontrado"});continue}try{requested.push({item,field,value:fv.value,fieldValue:githubFieldValue(field,fv.value)})}catch(e){preflightFailures.push({external_id:item.external_id,item_id:item.item_id,field:field.name,error:cleanErrorText(asError(e),500)})}}}
      if(preflightFailures.length&&i.allow_partial!==true)return {status:"TRACKER_SYNC_BLOCKED_PREFLIGHT",requested:requested.length,updated:0,verified:0,failed:preflightFailures.length,failures:preflightFailures.slice(0,20),canonical_handoff:null,post_state:compactControl(await getControl(root))}
      if(i.dry_run)return {status:"TRACKER_SYNC_DRY_RUN",requested:requested.length,failures:preflightFailures,plan:requested.map((x:any)=>({external_id:x.item.external_id,item_id:x.item.item_id,field:x.field.name,value:x.value})),canonical_handoff:null}
      await assertAuthorizationUnchanged(root,"ade_tracker_project_sync",i)
      let updated=0;const failures=[...preflightFailures];for(const r of requested){try{await githubSetProjectField(before.token,before.project.id,r.item.item_id,r.field,r.fieldValue);updated++}catch(e){failures.push({external_id:r.item.external_id,item_id:r.item.item_id,field:r.field.name,error:cleanErrorText(asError(e),500)})}}
      const after=await githubProjectSnapshot(root),afterById=new Map<string,any>(after.items.map((x:any)=>[String(x.item_id),x]));let verified=0;const verification:any[]=[];for(const r of requested){const actual=afterById.get(String(r.item.item_id))?.fields?.[r.field.name],ok=String(actual??"").toLowerCase()===String(r.value??"").toLowerCase();if(ok)verified++;else failures.push({external_id:r.item.external_id,item_id:r.item.item_id,field:r.field.name,error:`TRACKER_VERIFY_FAILED: expected='${String(r.value).slice(0,120)}' actual='${String(actual).slice(0,120)}'`});verification.push({external_id:r.item.external_id,field:r.field.name,expected:r.value,actual,verified:ok})}
      const status=failures.length===0?"DONE":verified>0?"PARTIAL":"BLOCKED",changed=[`tracker sync requested=${requested.length} updated=${updated} verified=${verified} failed=${failures.length}`],evidenceRefs=verification.filter((x:any)=>x.verified).slice(0,8).map((x:any)=>`github-project:${after.project.id}:item:${x.external_id||"?"}:${x.field}=${String(x.actual).slice(0,120)}`)
      const handoff=await submitHandoff(root,{status,changed,evidence_refs:evidenceRefs,blocker:status==="BLOCKED"?`tracker sync failed=${failures.length}`:status==="PARTIAL"?`tracker sync partial failed=${failures.length}`:"",required_owner:"none",next:"orchestrator: read ade_route_snapshot post-operation"},String(t?.agent||"project-manager"),String(t?.sessionID||""),"runtime","tracker.project.sync");await appendJsonl(controlPaths(root).audit,{ts:now(),event:"tracker.sync.batch",actor:String(t?.agent||"project-manager"),status:"OBSERVADO",requested:requested.length,updated,verified,failed:failures.length,evidence_refs:evidenceRefs});return {status:`TRACKER_SYNC_${status}`,project:after.project,requested:requested.length,updated,verified,failed:failures.length,failures:failures.slice(0,20),verification:verification.slice(0,100),canonical_handoff:compactHandoff(handoff),post_state:compactControl(await getControl(root))}})
    }

    const executeTracker=async(i:any, mode:"read"|"write")=>{
      const root=projectRoot(ctx,i)
      const readActions=new Set(["discover","list","get"])
      const writeActions=new Set(["create","update","comment","transition","link-pr","sync"])
      if(mode==="read"&&!readActions.has(i.action)) throw new Error(`TRACKER_BLOCKED: action '${i.action}' não é read`)
      if(mode==="write"&&!writeActions.has(i.action)) throw new Error(`TRACKER_BLOCKED: action '${i.action}' não é write`)
      const trackerPolicyPath=path.join(root,".ai","tracker-policy.json")
      const trackerPolicy=await readProjectJson(root,".ai/tracker-policy.json","tracker policy")
      if(mode==="read"&&trackerPolicy.read?.authorized!==true) throw new Error("TRACKER_BLOCKED: tracker read unauthorized")
      if(mode==="write"&&!i.dry_run&&trackerPolicy.write?.authorized!==true) throw new Error("TRACKER_BLOCKED: tracker write unauthorized")
      const cfg=await readProjectJson(root,".ai/integrations.json","integrations")
      const provider=String(cfg.work_management?.provider||"none")
      if(provider==="none")throw new Error("TRACKER_BLOCKED: provider none")
      const providerCfg=cfg.work_management?.[provider] || {}
      assertTrackerRemoteScope(trackerPolicy,provider,providerCfg)
      if(mode==="write")assertNoSecretOutbound("TRACKER_OUTBOUND_BLOCKED",i.title,i.body,i.status,i.query,i.url)
      const connectionId=String(providerCfg.connection_id || provider)
      const ps=await findPowerShell(root)
      const script=path.join(pluginRoot,"compat-runtime","work-management.ps1")
      if(!(await exists(script)))throw new Error("TRACKER_BLOCKED: compatibility work-management.ps1 ausente")
      const args=["-NoProfile","-File",script,"-ProjectRoot",root,"-Action",i.action]
      const map:any={internal_id:"-InternalId",external_id:"-ExternalId",title:"-Title",body:"-Body",status:"-Status",url:"-Url",query:"-Query"}
      for(const [k,flag] of Object.entries(map))if(i[k])args.push(String(flag),String(i[k]))
      if(i.dry_run)args.push("-DryRun")
      const env=minimalEnv(),secret=await integrationSecret(ctx,connectionId)
      if(!secret)throw new Error(`TRACKER_BLOCKED: conexão ${provider} autorizada do OpenCode indisponível`)
      if(provider==="github")env.GH_TOKEN=secret;if(provider==="linear")env.LINEAR_API_KEY=secret;if(provider==="jira")env.JIRA_API_TOKEN=secret
      if(provider==="jira"&&typeof providerCfg.email==="string"&&providerCfg.email.trim())env.JIRA_EMAIL=providerCfg.email.trim()
      const allowedHosts=Array.isArray(trackerPolicy.remote?.allowed_https_hosts)?trackerPolicy.remote.allowed_https_hosts.map((x:any)=>String(x).toLowerCase()):[]
      if(provider==="jira"){let u:URL;try{u=new URL(String(providerCfg.base_url||""))}catch{throw new Error("TRACKER_BLOCKED: jira.base_url inválida")};if(u.protocol!=="https:"||u.username||u.password||!allowedHosts.includes(u.hostname.toLowerCase()))throw new Error("TRACKER_BLOCKED: jira host não autorizado em tracker-policy.remote.allowed_https_hosts")}
      if(mode==="write"&&!i.dry_run)await assertAuthorizationUnchanged(root,"ade_tracker_write",i)
      const r=await runTrusted(ps,args,{cwd:root,env,timeout:120000})
      if(r.code!==0)throw new Error(r.stderr||r.stdout)
      let parsed:any; try{parsed=JSON.parse(r.stdout)}catch{parsed={raw:r.stdout}}
      return {status:"OBSERVADO",provider,mode,backend:"typed-plugin/v4-compat",result:parsed}
    }

    const trackerTargetIdentity=(provider:string,providerCfg:any,project?:any)=>{
      const base:any={provider,connection_id:String(providerCfg?.connection_id||provider||"")}
      if(provider==="github") return {...base,host:"api.github.com",owner:String(providerCfg?.owner||""),repository:String(providerCfg?.repository||""),project_owner:String(providerCfg?.project_owner||providerCfg?.owner||""),project_number:Number(providerCfg?.project_number||0),project_id:String(project?.id||"")}
      if(provider==="jira"){let host="";try{host=new URL(String(providerCfg?.base_url||"")).hostname.toLowerCase()}catch{};return {...base,host,project_key:String(providerCfg?.project_key||"")}}
      if(provider==="linear") return {...base,host:"api.linear.app",team_id:String(providerCfg?.team_id||"")}
      return {...base}
    }
    const resolveAuthorizationFingerprint=async(root:string,name:string,input:any):Promise<string>=>{
      if(name==="ade_tracker_project_sync"){
        const {provider,providerCfg}=await trackerSettings(root,true);if(provider!=="github")throw new Error(`TRACKER_BLOCKED: deterministic project sync supports github; provider=${provider}`)
        const target=trackerTargetIdentity(provider,providerCfg)
        return resourceFingerprintFor(name,input,{target})
      }
      if(name==="ade_tracker_write"){
        const {provider,providerCfg}=await trackerSettings(root,true);return resourceFingerprintFor(name,input,{target:trackerTargetIdentity(provider,providerCfg)})
      }
      if(name==="ade_vcs_stage"){
        const material=await worktreeAuthorizationMaterial(root,input.paths);return resourceFingerprintFor(name,input,{worktree_content_sha256:sha256Hex(canonicalStringify(material))})
      }
      if(name==="ade_vcs_commit"){
        const material=await stagedAuthorizationMaterial(root);return resourceFingerprintFor(name,input,material)
      }
      if(name==="ade_vcs_push"){
        const policy=await vcsPolicy(root);if(policy.push?.allowed!==true)throw new Error("VCS_BLOCKED: push disabled")
        const branch=await currentBranch(root),remote=String(policy.push?.remote||"origin");if(!/^[A-Za-z0-9._-]+$/.test(remote))throw new Error("VCS_BLOCKED: remote inválido")
        const remote_url=await assertPushRemoteAllowed(root,policy,remote),head_sha=await currentHeadSha(root)
        return resourceFingerprintFor(name,input,{branch,remote,remote_url,head_sha})
      }
      if(name==="ade_pr_create"){
        const policy=await vcsPolicy(root);if(policy.pull_request?.allowed!==true)throw new Error("VCS_BLOCKED: pull_request disabled")
        const cfg=await readProjectJson(root,".ai/integrations.json","integrations"),g=cfg.work_management?.github||{},owner=String(g.owner||""),repository=String(g.repository||"")
        if(!owner||!repository)throw new Error("VCS_BLOCKED: github owner/repository ausente");assertPullRequestRepositoryAllowed(policy,owner,repository)
        const head=await currentBranch(root),head_sha=await currentHeadSha(root),defaultBase=String(policy.pull_request?.base_branch||"main"),base=String(input.base||defaultBase)
        const allowedBases=Array.isArray(policy.pull_request?.allowed_base_branches)?policy.pull_request.allowed_base_branches.map(String):[defaultBase];if(!allowedBases.includes(base))throw new Error(`VCS_BLOCKED: base branch não autorizada: ${base}`)
        return resourceFingerprintFor(name,{...input,base},{owner,repository,head,head_sha,base})
      }
      if(name==="ade_project_check"||name==="ade_diagnostic_check"){
        const expected=name==="ade_project_check"?"verifier":"debugger",m=await projectCheckDefinitionMaterial(root,String(input.name||""),expected as any)
        return resourceFingerprintFor(name,input,m)
      }
      throw new Error(`ADE_HUMAN_AUTHORIZATION_REQUIRED: unsupported authorization fingerprint for ${name}`)
    }
    const assertAuthorizationUnchanged=async(root:string,name:string,input:any)=>{
      const expected=String(input?.__ade_authorization_fingerprint||"");if(!expected)throw new Error(`ADE_HUMAN_AUTHORIZATION_REQUIRED: ${name} missing authorization fingerprint`)
      const actual=await resolveAuthorizationFingerprint(root,name,input)
      if(actual!==expected)throw new Error(`ADE_AUTHORIZATION_STALE: ${name} target/effect changed after grant; re-authorize exact operation`)
    }
    await ctx.tool.transform((draft:any)=>{
      const add=(name:string,description:string,input:Json,execute:(input:Json,tool:any)=>Promise<Json>)=>draft.add({
        name:name.replace(/^ade_/,""), description, input,
        options:{namespace:"ade",codemode:false,permission:name},
        execute:async(i:any,t:any)=>{
          const started=Date.now(); let root=""; let status="completed"; let grantId: string | undefined; let authorization="N/A"
          try {
            const scope=await resolveSessionScope(ctx,String(t?.sessionID||"")); root=scope.root
            const needsGrant=HUMAN_REQUIRED.has(name)&&i?.dry_run!==true
            let authFp=""
            if(needsGrant){
              authFp=await resolveAuthorizationFingerprint(root,name,i)
              const res=await consumeHumanGrant(root,name,authFp)
              if(!res.consumed)throw new Error(res.reason||`ADE_HUMAN_AUTHORIZATION_REQUIRED: ${name} requires explicit external /ade-authorize grant for this exact effect`)
              grantId=res.grantId;authorization="EXPLICIT_EXTERNAL_GRANT"
            }
            const scoped={...i,__ade_root:scope.root,__ade_location:scope.location,__ade_canonical:scope.canonical,__ade_grant_id:grantId,__ade_authorization:authorization,__ade_authorization_fingerprint:authFp}
            const value=await execute(scoped,t)
            if(grantId){try{await appendJsonl(controlPaths(root).telemetry,{ts:now(),kind:"human.grant.consume",session_ref:crypto.createHash("sha256").update(String(t?.sessionID||"")).digest("hex").slice(0,16),agent:String(t?.agent||"unknown"),tool:name,grant_id:grantId.slice(0,8),authorization})}catch{}}
            return result(redactForModel(value))
          } catch(e) {
            status="blocked"
            try{if(root){const msg=String((e as any)?.message||"");if(msg.includes("ADE_HUMAN_AUTHORIZATION_REQUIRED")||msg.includes("ADE_AUTHORIZATION_STALE"))await appendJsonl(controlPaths(root).telemetry,{ts:now(),kind:"human.grant.missing",session_ref:crypto.createHash("sha256").update(String(t?.sessionID||"")).digest("hex").slice(0,16),agent:String(t?.agent||"unknown"),tool:name,authorization:"NONE_OR_STALE"})}}catch{}
            return result({status:"BLOCKED",error:cleanErrorText(asError(e))})
          } finally {
            if(root){try{await appendJsonl(controlPaths(root).telemetry,{ts:now(),kind:"tool.call",session_ref:crypto.createHash("sha256").update(String(t?.sessionID||"")).digest("hex").slice(0,16),agent:String(t?.agent||"unknown"),tool:name,status,duration_ms:Date.now()-started,authorization:HUMAN_REQUIRED.has(name)&&i?.dry_run!==true?authorization:"N/A"})}catch{}}
          }
        },
      })
      add("ade_status","Read compact canonical ADE state and routing hint.",schemaObject({}),async i=>{const root=projectRoot(ctx,i); const control=await getControl(root); return {plugin:{id:PLUGIN_ID,version:VERSION,opencode:ctx.app?.version},project_root:root,...compactControl(control)}})
      add("ade_route_snapshot","Return the minimal state-driven routing decision for the current ADE state.",schemaObject({}),async i=>{const root=projectRoot(ctx,i),control=await getControl(root); return {status:"OBSERVADO",revision:Number(control.revision||0),global_status:control.global_status,routing_hint:routingHint(control),handoff_advisory:handoffAdvisory(control),planes:{product:compactPlane(control.product),delivery:compactPlane(control.delivery),engineering:compactPlane(control.engineering)},recent_handoffs:(Array.isArray(control.recent_handoffs)?control.recent_handoffs:[]).slice(-3)}})
      add("ade_handoff_submit","Publish the canonical bounded handoff consumed by ADE routing instead of relying on free-form child prose.",schemaObject({status:str({enum:["DONE","PARTIAL","BLOCKED","FAILED"]}),changed:boundedStringArray(8,180),evidence_refs:boundedStringArray(8,240),blocker:str({maxLength:800}),required_owner:str({enum:["none","orchestrator","product-owner","project-manager","engineer"]}),next:str({maxLength:500})},["status"]),async(i,t)=>submitHandoff(projectRoot(ctx,i),i,String(t?.agent||"unknown"),String(t?.sessionID||"")))
      add("ade_doctor","Inspect ADE/OpenCode native runtime without exposing credentials.",schemaObject({}),async i=>{const root=projectRoot(ctx,i); const agentsR=await ctx.agent.list({location:i.__ade_location}); const skillsR=await ctx.skill.list({location:i.__ade_location}); const pluginsR=await ctx.plugin.list({location:i.__ade_location}); const agents=agentsR.data||[],skills=skillsR.data||[],plugins=pluginsR.data||[]; let vcs:any; try{const r=await ctx.vcs.get({location:i.__ade_location});vcs=r.data}catch(e){vcs={error:asError(e)}}; return {status:"ADE_DOCTOR_OK",version:VERSION,opencode:ctx.app?.version,project_root:root,canonical_root:i.__ade_canonical,agents_present:Object.keys(agentTools).filter(id=>agents.some((a:any)=>a.id===id||a.name===id)),skill_present:skills.some((x:any)=>x.id==="ai-driven-engineering"),plugin_present:plugins.some((x:any)=>String(x.id||x.name||"").includes("ai-driven-engineering")),vcs,ai_control:await exists(path.join(root,".ai","control.json")),tools_registered:registered}})
      add("ade_vcs_status","Read working-copy status through OpenCode VCS API.",schemaObject({}),async i=>{const r=await ctx.vcs.status({location:i.__ade_location});return {status:"OBSERVADO",changes:redactForModel(r.data),location:r.location}})
      add("ade_vcs_diff","Read repository diff through OpenCode VCS API.",schemaObject({mode:str({enum:["working","branch","committed"]}),base:str(),context:integer({minimum:0,maximum:20})}),async i=>{const r=await ctx.vcs.diff({location:i.__ade_location,mode:i.mode||"working",base:i.base||undefined,context:i.context??3});return {status:"OBSERVADO",diff:redactForModel(r.data),location:r.location}})
      add("ade_vcs_branches","List repository branches through OpenCode VCS API.",schemaObject({search:str(),limit:integer({minimum:1,maximum:100})}),async i=>{const r=await ctx.vcs.branches({location:i.__ade_location,search:i.search||undefined,limit:i.limit||20});return {status:"OBSERVADO",branches:r.data,location:r.location}})
      add("ade_runtime_observe","Observe container/image runtime without mutation.",schemaObject({kind:str({enum:["containers","image"]}),image:str()},["kind"]),async i=>{const root=projectRoot(ctx,i); const image=i.kind==="image"?safeImageRef(String(i.image||"")):""; const args=i.kind==="containers"?["ps","--format","{{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"]:["image","inspect",image,"--format","{{.Id}}\t{{json .RepoTags}}\t{{.Size}}\t{{.Created}}"] ; if(i.kind==="image"&&!i.image)throw new Error("image obrigatório"); const r=await runTrusted("docker",args,{cwd:root,env:minimalEnv(),timeout:15000}); return {status:r.code===0?"OBSERVADO":"DESCONHECIDO",fields:i.kind==="containers"?["id","image","name","status","ports"]:["id","repo_tags","size","created"],exit_code:r.code,stdout:r.stdout,stderr:r.stderr}})
      add("ade_self_check","Run a non-destructive syntax/parse self-check. Does not grant validation authority.",schemaObject({kind:str({enum:["php-syntax","json-parse","python-syntax","node-syntax"]}),path:str()},["kind","path"]),async i=>{const root=projectRoot(ctx,i),file=await safeExistingRealPath(root,i.path,"self-check path"); let out:any={status:"SELF_CHECK_PASSED",evidence_state:"OBSERVADO",validation_authority:false,acceptance_authority:false,kind:i.kind,path:path.relative(root,file)}; if(i.kind==="json-parse"){JSON.parse(await fs.readFile(file,"utf8"));return out} let exe:string,args:string[]; if(i.kind==="php-syntax"){exe="php";args=["-l",file]} else if(i.kind==="python-syntax"){exe=process.platform==="win32"?"python":"python3";args=["-c","import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'), sys.argv[1], 'exec')",file]} else {exe="node";args=["--check",file]} const r=await runTrusted(exe,args,{cwd:root,env:minimalEnv(),timeout:30000}); if(r.code!==0)throw new Error(`${i.kind} failed: ${r.stderr||r.stdout}`); return {...out,stdout:r.stdout}})
      add("ade_project_check","Execute one authorized verifier-owned project check from .ai/execution-policy.json.",schemaObject({name:str()},["name"]),async i=>{const root=projectRoot(ctx,i);return nativeProjectCheck(root,i.name,"verifier",true,()=>assertAuthorizationUnchanged(root,"ade_project_check",i))})
      add("ade_diagnostic_check","Execute one authorized non-destructive project check for diagnosis without validation authority.",schemaObject({name:str()},["name"]),async i=>{const root=projectRoot(ctx,i);return nativeProjectCheck(root,i.name,"debugger",false,()=>assertAuthorizationUnchanged(root,"ade_diagnostic_check",i))})
      add("ade_state_get","Read canonical control state; compact by default, full only when explicitly required.",schemaObject({detail:str({enum:["compact","full"]})}),async i=>{const s=await getControl(projectRoot(ctx,i));return i.detail==="full"?{status:"OBSERVADO",control:s}:{status:"OBSERVADO",control:compactControl(s)}})
      add("ade_product_transition","Apply a valid Product-plane state transition.",schemaObject({target:str({maxLength:64}),note:str({maxLength:1200}),evidence:boundedStringArray(16,512)},["target"]),async(i,t)=>transitionWithRuntimeHandoff(i,t,"product"))
      add("ade_delivery_transition","Apply a valid Delivery-plane state transition.",schemaObject({target:str({maxLength:64}),note:str({maxLength:1200}),evidence:boundedStringArray(16,512)},["target"]),async(i,t)=>transitionWithRuntimeHandoff(i,t,"delivery"))
      add("ade_engineering_transition","Apply a valid Engineering-plane state transition.",schemaObject({target:str({maxLength:64}),note:str({maxLength:1200}),evidence:boundedStringArray(16,512)},["target"]),async(i,t)=>transitionWithRuntimeHandoff(i,t,"engineering"))
      add("ade_evidence_record","Record canonical evidence in .ai/control.json and audit log.",schemaObject({plane:str({enum:["product","delivery","engineering","orchestration","runtime"]}),state:str({enum:["OBSERVADO","INFERIDO","PROPOSTO","DESCONHECIDO"]}),summary:str({minLength:1,maxLength:1200}),refs:boundedStringArray(16,512)},["plane","state","summary"]),async i=>recordEvidence(projectRoot(ctx,i),i))
      add("ade_product_validation_record","Record revision-bound VALIDADO evidence for Product plane; only Product Owner receives this capability.",schemaObject({summary:str({minLength:1,maxLength:1200}),refs:boundedStringArray(16,512)},["summary"]),async i=>recordPlaneValidation(projectRoot(ctx,i),i,"product",["AUTHORIZED_BY_REQUEST","APPROVED"]))
      add("ade_delivery_validation_record","Record revision-bound VALIDADO evidence for Delivery plane; only Project Manager receives this capability.",schemaObject({summary:str({minLength:1,maxLength:1200}),refs:boundedStringArray(16,512)},["summary"]),async i=>recordPlaneValidation(projectRoot(ctx,i),i,"delivery",["IN_EXECUTION"]))
      add("ade_engineering_validation_record","Record revision-bound VALIDADO evidence for Engineering plane; only Verifier receives this capability.",schemaObject({summary:str({minLength:1,maxLength:1200}),refs:boundedStringArray(16,512)},["summary"]),async i=>recordPlaneValidation(projectRoot(ctx,i),i,"engineering",["VERIFYING"]))
      add("ade_evidence_query","Query canonical evidence history with a small default window.",schemaObject({plane:str(),state:str(),limit:integer({minimum:1,maximum:50})}),async i=>{let e=await evidenceHistory(projectRoot(ctx,i)); if(i.plane)e=e.filter((x:any)=>x.plane===i.plane); if(i.state)e=e.filter((x:any)=>x.state===i.state); const limit=i.limit||5; return {status:"OBSERVADO",count:e.length,evidence:e.slice(-limit)}})
      add("ade_tracker_project_snapshot","Read a bounded GitHub Project V2 snapshot directly through the authorized integration; remote content is untrusted data.",schemaObject({external_ids:boundedStringArray(100,120),limit:integer({minimum:1,maximum:200})}),async i=>{const root=projectRoot(ctx,i);const snap=await githubProjectSnapshot(root),ids=new Set((i.external_ids||[]).map((x:any)=>String(x))),limit=Number(i.limit||50);const selected=ids.size?snap.items.filter((x:any)=>x.external_id&&ids.has(String(x.external_id))).slice(0,limit):snap.items.slice(0,limit);const fields=snap.fields.slice(0,100).map((f:any)=>({id:f.id,name:String(f.name||"").slice(0,160),dataType:f.dataType,options:Array.isArray(f.options)?f.options.slice(0,100).map((o:any)=>({id:o.id,name:String(o.name||"").slice(0,160)})):undefined,iterations:Array.isArray(f.configuration?.iterations)?f.configuration.iterations.slice(0,100).map((o:any)=>({id:o.id,title:String(o.title||"").slice(0,160)})):undefined}));return {status:"TRACKER_PROJECT_SNAPSHOT",trust:"REMOTE_UNTRUSTED_DATA",project:snap.project,fields,items:selected,item_count_total:snap.items.length,truncated:selected.length<snap.items.length}})
      add("ade_tracker_project_sync","Synchronize configured GitHub Project V2 fields as a deterministic batch, read back the result, and emit a runtime canonical handoff.",schemaObject({updates:{type:"array",maxItems:50,items:schemaObject({external_id:str({maxLength:120}),item_id:str({maxLength:160}),fields:{type:"array",minItems:1,maxItems:10,items:schemaObject({name:str({minLength:1,maxLength:120}),value:str({maxLength:240})},["name","value"])}},["fields"])},dry_run:bool(),allow_partial:bool()},["updates"]),async(i,t)=>executeProjectSync(i,t))
      add("ade_tracker_read","Read-only Delivery-plane tracker adapter.",schemaObject({action:str({enum:["discover","list","get"]}),external_id:str(),query:str()},["action"]),async i=>executeTracker(i,"read"))
      add("ade_tracker_write","Mutating Delivery-plane tracker adapter; write policy required unless dry_run.",schemaObject({action:str({enum:["create","update","comment","transition","link-pr","sync"]}),internal_id:str(),external_id:str(),title:str({maxLength:240}),body:str({maxLength:20000}),status:str({maxLength:240}),url:str({maxLength:2048}),query:str({maxLength:1000}),dry_run:bool()},["action"]),async i=>executeTracker(i,"write"))
      add("ade_vcs_stage","Stage explicit workspace paths under VCS policy.",schemaObject({paths:boundedStringArray(100,1024)},["paths"]),async i=>{
        const root=projectRoot(ctx,i),policy=await vcsPolicy(root);if(policy.stage?.allowed!==true)throw new Error("VCS_BLOCKED: stage disabled")
        const paths=(i.paths||[]).map((p:string)=>relativeLiteralPath(root,p));if(!paths.length)throw new Error("VCS_BLOCKED: paths vazios")
        await assertAuthorizationUnchanged(root,"ade_vcs_stage",i)
        const r=await runGit(root,["-C",root,"--literal-pathspecs","add","--",...paths]);if(r.code!==0)throw new Error(cleanErrorText(r.stderr));await assertNoSecretStaged(root);return {status:"VCS_STAGED",paths}
      })
      add("ade_vcs_commit","Create a non-amending commit under VCS policy without bypassing hooks/signing by default.",schemaObject({message:str({minLength:1,maxLength:240})},["message"]),async i=>{
        const root=projectRoot(ctx,i),policy=await vcsPolicy(root);if(policy.commit?.allowed!==true)throw new Error("VCS_BLOCKED: commit disabled");if(/[\r\n]/.test(i.message))throw new Error("VCS_BLOCKED: commit message multiline");assertNoSecretOutbound("VCS_OUTBOUND_BLOCKED",i.message)
        const b=await currentBranch(root);if(protectedBranch(policy,b)&&policy.commit?.allow_protected_branches!==true)throw new Error(`VCS_BLOCKED: protected branch ${b}`)
        const staged=await runGit(root,["-C",root,"diff","--cached","--quiet"]);if(staged.code===0)throw new Error("VCS_BLOCKED: nada staged");if(staged.code!==1)throw new Error(cleanErrorText(staged.stderr||"VCS_BLOCKED: staged diff check falhou"));await assertNoSecretStaged(root)
        await assertAuthorizationUnchanged(root,"ade_vcs_commit",i)
        const args=["-C",root,"commit","-m",i.message];if(policy.hooks?.allow_bypass===true)args.splice(3,0,"--no-verify")
        const r=await runGit(root,args,{timeout:120000});if(r.code!==0)throw new Error(cleanErrorText(r.stderr||r.stdout));const sha=await currentHeadSha(root)
        await appendJsonl(controlPaths(root).audit,{ts:now(),event:"vcs.commit",actor:"vcs-operator",status:"OBSERVADO",evidence_refs:[`git:${sha}`],branch:b,hooks_bypassed:policy.hooks?.allow_bypass===true});return {status:"VCS_COMMITTED",sha,branch:b,hooks_bypassed:policy.hooks?.allow_bypass===true}
      })
      add("ade_vcs_push","Push current branch to configured remote; force/refspec bypasses are impossible and remote HEAD is verified.",schemaObject({}),async i=>{
        const root=projectRoot(ctx,i),policy=await vcsPolicy(root);if(policy.push?.allowed!==true)throw new Error("VCS_BLOCKED: push disabled");const b=await currentBranch(root);if(protectedBranch(policy,b)&&policy.push?.allow_protected_branches!==true)throw new Error(`VCS_BLOCKED: protected branch ${b}`)
        const remote=String(policy.push?.remote||"origin");if(!/^[A-Za-z0-9._-]+$/.test(remote))throw new Error("VCS_BLOCKED: remote inválido");const remoteUrl=await assertPushRemoteAllowed(root,policy,remote)
        await assertAuthorizationUnchanged(root,"ade_vcs_push",i)
        const authorizedSha=await currentHeadSha(root),args=["-C",root,"push",remote,`${authorizedSha}:refs/heads/${b}`];if(policy.hooks?.allow_bypass===true)args.splice(3,0,"--no-verify");const r=await runGit(root,args,{timeout:120000});if(r.code!==0)throw new Error(cleanErrorText(r.stderr||r.stdout))
        const sha=authorizedSha,remoteHead=await runGit(root,["-C",root,"ls-remote","--heads",remote,`refs/heads/${b}`],{timeout:30000}),remoteSha=remoteHead.stdout.trim().split(/\s+/)[0]||"";if(remoteHead.code!==0||remoteSha!==sha)throw new Error("VCS_VERIFY_FAILED: remote branch não confirma authorized HEAD")
        await appendJsonl(controlPaths(root).audit,{ts:now(),event:"vcs.push",actor:"vcs-operator",status:"OBSERVADO",evidence_refs:[`git:${sha}`],branch:b,remote,hooks_bypassed:policy.hooks?.allow_bypass===true});return {status:"VCS_PUSHED",sha,remote_sha:remoteSha,verified:true,branch:b,remote,remote_url:remoteUrl,force:false,hooks_bypassed:policy.hooks?.allow_bypass===true}
      })
      add("ade_pr_create","Create a GitHub pull request from current branch through OpenCode integration auth.",schemaObject({title:str({minLength:1,maxLength:240}),body:str({maxLength:65000}),base:str({maxLength:240})},["title"]),async i=>{
        const root=projectRoot(ctx,i),policy=await vcsPolicy(root);if(policy.pull_request?.allowed!==true)throw new Error("VCS_BLOCKED: pull_request disabled")
        const cfg=await readProjectJson(root,".ai/integrations.json","integrations"),g=cfg.work_management?.github||{},owner=String(g.owner||""),repo=String(g.repository||"");if(!owner||!repo)throw new Error("VCS_BLOCKED: github owner/repository ausente");assertPullRequestRepositoryAllowed(policy,owner,repo);assertNoSecretOutbound("VCS_BLOCKED",i.title,i.body)
        const defaultBase=String(policy.pull_request?.base_branch||"main"),allowedBases=Array.isArray(policy.pull_request?.allowed_base_branches)?policy.pull_request.allowed_base_branches.map(String):[defaultBase],base=String(i.base||defaultBase);if(!allowedBases.includes(base))throw new Error(`VCS_BLOCKED: base branch não autorizada: ${base}`)
        const token=await integrationSecret(ctx,String(g.connection_id||"github"));if(!token)throw new Error("VCS_BLOCKED: conexão GitHub autorizada do OpenCode indisponível");const head=await currentBranch(root)
        await assertAuthorizationUnchanged(root,"ade_pr_create",{...i,base})
        const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),30000);let response:any;try{response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,{method:"POST",redirect:"error",signal:ctl.signal,headers:{"accept":"application/vnd.github+json","authorization":`Bearer ${token}`,"x-github-api-version":"2022-11-28","content-type":"application/json","user-agent":`ade-opencode/${VERSION}`},body:JSON.stringify({title:i.title,body:i.body||"",head,base})})}finally{clearTimeout(tm)}
        const raw=await response.text();if(Buffer.byteLength(raw,"utf8")>1000000)throw new Error("GitHub PR response too large");let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}if(!response.ok)throw new Error(`GitHub PR failed ${response.status}: ${cleanErrorText(data?.message||"unknown",300)}`)
        await appendJsonl(controlPaths(root).audit,{ts:now(),event:"vcs.pull-request",actor:"vcs-operator",status:"OBSERVADO",evidence_refs:[String(data.html_url||"")],head,base});return {status:"PR_CREATED",number:data.number,url:data.html_url,head,base}
      })
    })

    await ctx.command.transform((draft:any)=>{
      draft.add({name:"ade-init",description:"Initialize canonical .ai state for ADE v5. Usage: /ade-init [WORK-ITEM] [LEAN|STANDARD|HIGH_ASSURANCE]",execute:async({sessionID,prompt}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root;const req=parseInitRequest(prompt);const initialized=await initProject(root,pluginRoot,req.workItem,req.profile);await ctx.session.synthetic({sessionID,text:`ADE_INIT_OK v${VERSION}: ${initialized.ai} | work_item=${initialized.work_item_id} | profile=${initialized.profile} | created=${initialized.created.length} | preserved=${initialized.preserved.length}`})}})
      draft.add({name:"ade-status",description:"Show canonical ADE state",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root;try{const s=await getControl(root);await ctx.session.synthetic({sessionID,text:`ADE v${VERSION} | global=${s.global_status} | product=${s.product?.status} | delivery=${s.delivery?.status} | engineering=${s.engineering?.status}`})}catch(e){await ctx.session.synthetic({sessionID,text:`ADE_STATUS_BLOCKED: ${cleanErrorText(asError(e))}`})}}})
      draft.add({name:"ade-doctor",description:"Show native ADE runtime diagnostics without an LLM round-trip",execute:async({sessionID}:any)=>{const scope=await resolveSessionScope(ctx,String(sessionID)),root=scope.root;const agentsR=await ctx.agent.list({location:scope.location});const skillsR=await ctx.skill.list({location:scope.location});const pluginsR=await ctx.plugin.list({location:scope.location});const text={status:"ADE_DOCTOR_OK",version:VERSION,opencode:ctx.app?.version,project_root:root,agents_present:Object.keys(agentTools).filter(id=>(agentsR.data||[]).some((a:any)=>a.id===id||a.name===id)),skill_present:(skillsR.data||[]).some((x:any)=>x.id==="ai-driven-engineering"),plugin_present:(pluginsR.data||[]).some((x:any)=>String(x.id||x.name||"").includes("ai-driven-engineering")),ai_control:await exists(path.join(root,".ai","control.json")),tools_registered:registered};await ctx.session.synthetic({sessionID,text:JSON.stringify(text,null,2)})}})
      draft.add({name:"ade-why",description:"Explain the current state-driven routing hint",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,s=await getControl(root);await ctx.session.synthetic({sessionID,text:`ADE WHY | revision=${s.revision||0} | routing=${JSON.stringify(routingHint(s))} | handoff=${JSON.stringify(handoffAdvisory(s))}`})}})
      draft.add({name:"ade-trace",description:"Show recent ADE tool-routing telemetry",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,p=controlPaths(root).telemetry;const rows=(await readJsonl(p)).slice(-20);await ctx.session.synthetic({sessionID,text:`ADE_TRACE_LAST_20\n${rows.map((x:any)=>`${x.ts} agent=${x.agent} tool=${x.tool} status=${x.status} duration_ms=${x.duration_ms}`).join("\n")}`})}})
      draft.add({name:"ade-metrics",description:"Summarize routing, retry and estimated context-cost signals without storing prompts",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,rows=(await readJsonl(controlPaths(root).telemetry)).slice(-500);const byAgent:any={},byTool:any={},byModel:any={};let blocked=0,totalMs=0,dispatches=0,retries=0,approxInput=0,requestedOutput=0;for(const x of rows){const a=String(x.agent||"unknown");byAgent[a]??={tool_calls:0,model_dispatches:0,retries:0,approx_input_tokens:0,requested_output_budget:0};if(x.kind==="tool.call"||x.tool){byAgent[a].tool_calls++;byTool[x.tool]=(byTool[x.tool]||0)+1;if(x.status!=="completed")blocked++;totalMs+=Number(x.duration_ms||0)}if(x.kind==="model.dispatch"){dispatches++;byAgent[a].model_dispatches++;const n=Number(x.approx_context_tokens||0);approxInput+=n;byAgent[a].approx_input_tokens+=n;const b=Number(x.generation_budget||0);requestedOutput+=b;byAgent[a].requested_output_budget+=b;const key=`${x.provider||"?"}/${x.model||"?"}`;byModel[key]=(byModel[key]||0)+1}if(x.kind==="provider.retry"){retries++;byAgent[a].retries++}}await ctx.session.synthetic({sessionID,text:JSON.stringify({window:rows.length,tool_calls:Object.values(byTool).reduce((a:any,b:any)=>a+Number(b),0),blocked_tool_calls:blocked,total_tool_duration_ms:totalMs,model_dispatches:dispatches,provider_retries:retries,approx_input_tokens_dispatched:approxInput,requested_output_token_budget:requestedOutput,exact_provider_usage:false,note:"approx_input_tokens_dispatched is chars/4 context estimate, not billed tokens",by_agent:byAgent,by_tool:byTool,by_model:byModel},null,2)})}})
      draft.add({name:"ade-cost",description:"Show exact provider usage from session messages when exposed, plus ADE dispatch estimates",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root;let messages:any[]=[];try{messages=Array.from(await ctx.session.context({sessionID})) as any[]}catch{}const exact=exactUsageFromMessages(messages);const activity=sessionActivity(messages);const rows=(await readJsonl(controlPaths(root).telemetry)).filter((x:any)=>x.session_ref===crypto.createHash("sha256").update(String(sessionID)).digest("hex").slice(0,16)&&x.kind==="model.dispatch");const estimate={dispatches:rows.length,approx_input_tokens_dispatched:rows.reduce((n:number,x:any)=>n+Number(x.approx_context_tokens||0),0),requested_output_token_budget:rows.reduce((n:number,x:any)=>n+Number(x.generation_budget||0),0)};await ctx.session.synthetic({sessionID,text:JSON.stringify({exact_provider_usage:exact,session_activity:activity,estimate,note:exact.available?"exact usage fields were exposed by session context":"provider usage fields unavailable; estimates are not billing"},null,2)})}})
      draft.add({name:"ade-handoffs",description:"Show recent canonical structured handoffs",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,rows=(await readJsonl(controlPaths(root).handoffs)).slice(-10);await ctx.session.synthetic({sessionID,text:JSON.stringify(redactForModel({count:rows.length,handoffs:rows}),null,2)})}})
      draft.add({name:"ade-failures",description:"Show recent provider/runtime failure signatures and circuit-breaker decisions",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,rows=(await readJsonl(controlPaths(root).telemetry)).filter((x:any)=>x.kind==="provider.retry").slice(-20);await ctx.session.synthetic({sessionID,text:JSON.stringify({count:rows.length,failures:rows.map((x:any)=>({ts:x.ts,agent:x.agent,provider:x.provider,model:x.model,failure_signature:x.failure_signature,failure_domain:x.failure_domain,seen_signature:x.seen_signature,retry:x.retry,delay_ms:x.delay_ms}))},null,2)})}})
      draft.add({name:"ade-resume",description:"Resume from canonical .ai state via orchestrator",execute:async({sessionID,prompt,delivery}:any)=>{await ctx.session.switchAgent({sessionID,agent:"orchestrator"});await ctx.session.prompt({sessionID,text:"Retome o trabalho a partir de .ai/control.json, contracts, checkpoint, traceability e audit. Preserve gates/autoridades e continue automaticamente até DONE, gate real ou decisão humana genuína.",delivery})}})
      draft.add({name:"ade-audit",description:"Show recent canonical ADE audit events",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,p=controlPaths(root).audit;let lines:string[]=[];if(await exists(p))lines=(await fs.readFile(p,"utf8")).trim().split(/\r?\n/).slice(-20);await ctx.session.synthetic({sessionID,text:`ADE_AUDIT_LAST_20\n${redactSensitiveText(lines.join("\n"),50000)}`})}})
      draft.add({name:"ade-authorize",description:"Create a short-lived single-use external grant for an exact high-impact effect. Usage: /ade-authorize <tool> <json-input>. The command resolves current remote/VCS/check state and binds the grant to it; agents have no ADE tool that can issue grants.",execute:async({sessionID,prompt}:any)=>{
        const scope=await resolveSessionScope(ctx,String(sessionID)),root=scope.root,text=String(prompt?.text||prompt||"").trim()
        if(!text){await ctx.session.synthetic({sessionID,text:`ADE_AUTHORIZE_USAGE: /ade-authorize <tool> <json-input>\nTools: ${[...HUMAN_REQUIRED].join(", ")}\nExamples:\n/ade-authorize ade_tracker_project_sync '{"updates":[{"external_id":"95","fields":[{"name":"Status","value":"Done"}]}]}'\n/ade-authorize ade_vcs_stage '{"paths":["src/app.ts"]}'\n/ade-authorize ade_vcs_commit '{"message":"fix: validation"}'\n/ade-authorize ade_vcs_push '{}'\n/ade-authorize ade_pr_create '{"title":"Release","body":"...","base":"main"}'\n/ade-authorize ade_project_check '{"name":"php-lint"}'\nGrant provenance=EXPLICIT_EXTERNAL_GRANT, TTL=10min, max_uses=1, store=${grantsRootDir()}`});return}
        const firstSpace=text.indexOf(" "),tool=firstSpace===-1?text:text.slice(0,firstSpace).trim();let resourceJson=firstSpace===-1?"{}":text.slice(firstSpace+1).trim()
        if(!HUMAN_REQUIRED.has(tool)){await ctx.session.synthetic({sessionID,text:`ADE_AUTHORIZE_BLOCKED: tool ${tool} not in HUMAN_REQUIRED set`});return}
        if((resourceJson.startsWith("'")&&resourceJson.endsWith("'"))||(resourceJson.startsWith('"')&&resourceJson.endsWith('"')))resourceJson=resourceJson.slice(1,-1)
        let input:any={};try{const parsed=JSON.parse(resourceJson||"{}");if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("input must be JSON object");input=parsed}catch(e){await ctx.session.synthetic({sessionID,text:`ADE_AUTHORIZE_BLOCKED: invalid JSON input: ${cleanErrorText(asError(e),240)}`});return}
        try{
          const fp=await resolveAuthorizationFingerprint(root,tool,input),grant=await createHumanGrant(root,tool,fp)
          await ctx.session.synthetic({sessionID,text:`ADE_AUTHORIZE_OK tool=${tool} grant=${grant.id.slice(0,8)} project_hash=${grant.project_hash} resource_hash=${grant.resource_hash.slice(0,12)} expires=${grant.expires_at} max_uses=1 provenance=EXPLICIT_EXTERNAL_GRANT`})
          try{await appendJsonl(controlPaths(root).telemetry,{ts:now(),kind:"human.grant.create",session_ref:crypto.createHash("sha256").update(String(sessionID)).digest("hex").slice(0,16),tool,grant_id:grant.id.slice(0,8),authorization:"EXPLICIT_EXTERNAL_GRANT"})}catch{}
        }catch(e){await ctx.session.synthetic({sessionID,text:`ADE_AUTHORIZE_BLOCKED: ${cleanErrorText(asError(e),600)}`})}
      }})
    })

    return async()=>{ await ctx.storage.set("runtime/last_unload",{version:VERSION,at:now()}) }
  },
})
