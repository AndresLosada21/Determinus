import { Plugin } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const VERSION = "5.2.0"
const PLUGIN_ID = "ai-driven-engineering.native"
const TOOL_PREFIX = "ade_"
const SECRET_FILE = /(^|[\\/])(\.env(?:\..*)?|[^\\/]*\.(pem|key|p12|pfx|kdbx|ovpn|npmrc|netrc|pypirc)|id_rsa|id_ed25519|[^\\/]*(credential|credentials|secret|secrets|token)[^\\/]*\.json)$/i

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

function result(value: Json) { return { content: JSON.stringify(value, null, 2) } }
function now() { return new Date().toISOString() }
function asError(e: unknown) { return e instanceof Error ? e.message : String(e) }
function inside(root: string, candidate: string) {
  const r = path.resolve(root); const c = path.resolve(candidate)
  return c === r || c.startsWith(r + path.sep)
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
function safeContainerPath(value:string,label:string) { if(!/^\/[A-Za-z0-9._\/-]+$/.test(value) || value.includes("..")) throw new Error(`PROJECT_CHECK_BLOCKED: ${label} inválido`); return value }
function safeImageRef(value:string) { if(!/^[A-Za-z0-9][A-Za-z0-9._\/:@-]*$/.test(value)) throw new Error("CAPABILITY_BLOCKED: image reference inválida"); return value }
function safeNetwork(value:string) { if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) || value.toLowerCase()==="host" || value.toLowerCase().startsWith("container")) throw new Error("PROJECT_CHECK_BLOCKED: network inválida"); return value }
function relativeLiteralPath(root:string,value:string) {
  const resolved=safeFile(root,value); const rel=path.relative(root,resolved)
  if(!rel || rel===".") throw new Error("VCS_BLOCKED: stage exige paths explícitos; project root não é aceito")
  return rel
}
async function assertNoSecretStaged(root:string) {
  const r=await run("git",["-C",root,"diff","--cached","--name-only","-z"],{cwd:root,timeout:15000})
  if(r.code!==0) throw new Error(r.stderr||"VCS_BLOCKED: não foi possível inspecionar staged paths")
  const names=r.stdout.split("\0").filter(Boolean)
  const blocked=names.filter(name=>SECRET_FILE.test(name.replaceAll("/",path.sep)))
  if(blocked.length) throw new Error(`VCS_BLOCKED: secret-like staged paths: ${blocked.join(", ")}`)
}
async function readJson(file: string): Promise<Json> { return JSON.parse(await fs.readFile(file,"utf8")) }
async function writeJsonAtomic(file: string, value: Json) {
  await fs.mkdir(path.dirname(file),{recursive:true}); const tmp = `${file}.tmp-${crypto.randomUUID()}`
  await fs.writeFile(tmp, JSON.stringify(value,null,2)+"\n", "utf8"); await fs.rename(tmp,file)
}
async function appendJsonl(file: string, value: Json) { await fs.mkdir(path.dirname(file),{recursive:true}); await fs.appendFile(file,JSON.stringify(value)+"\n","utf8") }
async function exists(file: string) { try { await fs.access(file); return true } catch { return false } }
async function writeTextAtomic(file:string, content:string) {
  await fs.mkdir(path.dirname(file),{recursive:true}); const tmp=`${file}.tmp-${crypto.randomUUID()}`
  await fs.writeFile(tmp,content,"utf8"); await fs.rename(tmp,file)
}
function parseInitRequest(prompt:any) {
  const text=typeof prompt?.text==="string"?prompt.text:typeof prompt==="string"?prompt:""
  const tokens=text.trim().split(/\s+/).filter(Boolean)
  const workItem=(tokens.find((x:string)=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(x) && !/^(LEAN|STANDARD|HIGH_ASSURANCE)$/i.test(x))||"WORK-001")
  const requested=tokens.find((x:string)=>/^(LEAN|STANDARD|HIGH_ASSURANCE)$/i.test(x))
  const profile=(requested||"STANDARD").toUpperCase() as "LEAN"|"STANDARD"|"HIGH_ASSURANCE"
  return {workItem,profile}
}
async function initProject(root:string,pluginRoot:string,workItem:string,profile:"LEAN"|"STANDARD"|"HIGH_ASSURANCE") {
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(workItem))throw new Error("ADE_INIT_BLOCKED: work item id inválido")
  const ai=path.join(root,".ai"), templates=path.join(pluginRoot,"assets","project-templates"), timestamp=now()
  if(!(await exists(templates)))throw new Error("ADE_INIT_BLOCKED: project templates ausentes no plugin")
  await fs.mkdir(ai,{recursive:true}); const created:string[]=[],preserved:string[]=[]
  const names=["product-contract.md","delivery-contract.md","engineering-contract.md","checkpoint.md","decision-log.md","execution-policy.md","execution-policy.json","control.json","integrations.json","traceability.json","vcs-policy.json","tracker-policy.json"]
  for(const name of names){
    const src=path.join(templates,name), dst=path.join(ai,name)
    if(await exists(dst)){preserved.push(name);continue}
    if(!(await exists(src)))throw new Error(`ADE_INIT_BLOCKED: template ausente ${name}`)
    let content=await fs.readFile(src,"utf8")
    content=content.replaceAll("{{WORK_ITEM_ID}}",workItem).replaceAll("{{TIMESTAMP}}",timestamp)
    if(name==="control.json"){
      const obj=JSON.parse(content); obj.work_item_id=workItem; obj.profile=profile; obj.updated_at=timestamp
      if(profile==="LEAN"){obj.product.required=false;obj.delivery.required=false}
      content=JSON.stringify(obj,null,2)+"\n"
    }
    await writeTextAtomic(dst,content); created.push(name)
  }
  for(const dir of ["work-items","delegations"]){const d=path.join(ai,dir);if(!(await exists(d))){await fs.mkdir(d,{recursive:true});created.push(`${dir}/`)}else preserved.push(`${dir}/`)}
  for(const logName of ["audit.jsonl","evidence.jsonl","telemetry.jsonl"]){const log=path.join(ai,logName);if(!(await exists(log))){await writeTextAtomic(log,"");created.push(logName)}else preserved.push(logName)}
  return {ai,work_item_id:workItem,profile,created,preserved}
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
async function withProjectLock<T>(root:string,scope:string,fn:()=>Promise<T>):Promise<T> {
  const lockDir=path.join(root,".ai","locks"); await fs.mkdir(lockDir,{recursive:true}); const lock=path.join(lockDir,`${scope}.lock`)
  let handle:any
  for(let attempt=0;attempt<100;attempt++){
    try{handle=await fs.open(lock,"wx"); await handle.writeFile(JSON.stringify({pid:process.pid,at:now(),scope})+"\n"); break}
    catch(e:any){if(e?.code!=="EEXIST")throw e; try{const st=await fs.stat(lock);if(Date.now()-st.mtimeMs>120000){await fs.unlink(lock);continue}}catch{}; await sleep(50)}
  }
  if(!handle)throw new Error(`STATE_BLOCKED: lock timeout ${scope}`)
  try{return await fn()}finally{try{await handle.close()}catch{};try{await fs.unlink(lock)}catch{}}
}

function run(executable: string, args: string[], options: { cwd:string, env?:NodeJS.ProcessEnv, timeout?:number } ): Promise<{code:number,stdout:string,stderr:string}> {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:options.cwd,env:options.env || process.env,shell:false,windowsHide:true})
    let out="",err=""; const cap=1_000_000
    child.stdout?.on("data",d=>{ if(out.length<cap) out+=String(d) }); child.stderr?.on("data",d=>{ if(err.length<cap) err+=String(d) })
    const timer=setTimeout(()=>{ child.kill(); reject(new Error(`timeout após ${options.timeout || 120000}ms`)) }, options.timeout || 120000)
    child.on("error",e=>{clearTimeout(timer);reject(e)}); child.on("close",c=>{clearTimeout(timer);resolve({code:c ?? -1,stdout:out,stderr:err})})
  })
}
async function commandExists(executable:string,cwd:string) { try { const r=await run(executable,["--version"],{cwd,timeout:5000}); return r.code===0 } catch { return false } }
async function findPowerShell(cwd:string) { if(await commandExists("pwsh",cwd)) return "pwsh"; if(await commandExists("powershell",cwd)) return "powershell"; throw new Error("PowerShell não disponível para compatibility backend") }

function controlPaths(root:string) { return {
  ai:path.join(root,".ai"),
  control:path.join(root,".ai","control.json"),
  audit:path.join(root,".ai","audit.jsonl"),
  evidence:path.join(root,".ai","evidence.jsonl"),
  telemetry:path.join(root,".ai","telemetry.jsonl"),
} }
function normalizeEvidence(value:any):any[] {
  if(Array.isArray(value)) return value.filter(x=>x && typeof x==="object")
  if(value && typeof value==="object") return Object.values(value).filter(x=>x && typeof x==="object")
  return []
}
function normalizeControl(s:Json) {
  if(!s || typeof s!=="object") throw new Error("CONTROL_INVALID: .ai/control.json não é objeto")
  s.schema_version=Math.max(Number(s.schema_version||0),3)
  const evidence=normalizeEvidence(s.evidence)
  s.evidence=evidence.slice(-20)
  if(!Number.isFinite(Number(s.evidence_count))) s.evidence_count=evidence.length
  return s
}
async function getControl(root:string) {
  const p=controlPaths(root).control
  if(!(await exists(p))) throw new Error(".ai/control.json ausente; execute /ade-init")
  return normalizeControl(await readJson(p))
}
async function readJsonl(file:string):Promise<any[]> {
  if(!(await exists(file))) return []
  const raw=await fs.readFile(file,"utf8")
  const out:any[]=[]
  for(const line of raw.split(/\r?\n/)){ if(!line.trim()) continue; try{out.push(JSON.parse(line))}catch{} }
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
  evidence_count:Number(s.evidence_count||normalizeEvidence(s.evidence).length),routing_hint:routingHint(s),work_management:{provider:s.work_management?.provider||"none",sync_status:s.work_management?.sync_status||"NOT_CONFIGURED"}
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
    const ev={id:`ev-${crypto.randomUUID()}`,ts:now(),state:fixed?.state||input.state,plane:fixed?.plane||input.plane,summary:input.summary,refs:input.refs||[],source:"opencode-plugin"}
    await persistEvidence(root,s,ev,"evidence.record")
    return ev
  })
}

async function recordPlaneValidation(root:string,input:Json,plane:"product"|"delivery"|"engineering",allowedStatuses:readonly string[]) {
  return withProjectLock(root,"control",async()=>{
    const s=await getControl(root); const current=String(s[plane]?.status||""); const revision=Number(s[plane]?.revision||0)
    if(!allowedStatuses.includes(current))throw new Error(`VALIDATION_BLOCKED: ${plane} não pode registrar VALIDADO em status=${current}`)
    const ev={id:`ev-${crypto.randomUUID()}`,ts:now(),state:"VALIDADO",plane,summary:input.summary,refs:input.refs||[],source:"opencode-plugin",plane_revision:revision,validated_status:current}
    await persistEvidence(root,s,ev,"evidence.validation")
    return ev
  })
}

function extractCredential(value:Json, top=true):string|undefined {
  if(top && typeof value==="string") return value
  if(!value || typeof value!=="object") return undefined
  for(const key of ["token","accessToken","access_token","key","value","secret"]) if(typeof value[key]==="string" && value[key]) return value[key]
  for(const v of Object.values(value)) { if(v && typeof v==="object"){ const found=extractCredential(v,false); if(found) return found } }
  return undefined
}
async function integrationSecret(ctx:any,id:string):Promise<string|undefined> {
  try { const c=await ctx.integration.connection.active(id); if(!c) return undefined; return extractCredential(await ctx.integration.connection.resolve(c)) } catch { return undefined }
}

async function nativeProjectCheck(root:string,name:string,expectedOwner:"verifier"|"debugger"="verifier",validationAuthority=true) {
  const policyPath=path.join(root,".ai","execution-policy.json")
  if(!(await exists(policyPath))) throw new Error(`PROJECT_CHECK_BLOCKED: execution policy ausente; project_root=${root}; policy=.ai/execution-policy.json`)
  const policy=await readJson(policyPath)
  const availableChecks=Object.keys(policy.checks||{}).sort()
  if(policy.authorized!==true) throw new Error(`PROJECT_CHECK_BLOCKED: policy authorized=false; project_root=${root}; policy=.ai/execution-policy.json; requested=${name}; available=[${availableChecks.join(",")}]`)
  const c=policy.checks?.[name]; if(!c) throw new Error(`PROJECT_CHECK_BLOCKED: check '${name}' ausente; project_root=${root}; policy=.ai/execution-policy.json; available=[${availableChecks.join(",")}]`)
  if(c.owner!==expectedOwner || c.non_destructive!==true) throw new Error(`PROJECT_CHECK_BLOCKED: owner/non_destructive inválido; expected=${expectedOwner} actual=${String(c.owner||"")}`)
  const allowed=Array.isArray(c.allowed_exit_codes)?c.allowed_exit_codes:[0]
  if(c.runner==="process") {
    const cwd=await safeExistingRealPath(root,String(c.working_directory || "."),"working_directory"); const cwdStat=await fs.stat(cwd); if(!cwdStat.isDirectory()) throw new Error("PROJECT_CHECK_BLOCKED: working_directory não é diretório")
    let exe=String(c.executable||""); if(!exe) throw new Error("PROJECT_CHECK_BLOCKED: executable ausente")
    const blockedExecutables=new Set(["pwsh","pwsh.exe","powershell","powershell.exe","cmd","cmd.exe","bash","sh","zsh","fish","wsl","docker","podman","git"])
    if(blockedExecutables.has(path.basename(exe).toLowerCase())) throw new Error(`PROJECT_CHECK_BLOCKED: executable genérico/bypass proibido: ${exe}`)
    if(path.isAbsolute(exe)||exe.includes("/")||exe.includes("\\")) { const resolved=path.isAbsolute(exe)?path.resolve(exe):path.resolve(cwd,exe); if(!inside(root,resolved)) throw new Error("PROJECT_CHECK_BLOCKED: executable por caminho fora do projeto"); exe=await safeExistingRealPath(root,resolved,"project-check executable") }
    const args=Array.isArray(c.arguments)?c.arguments.map((x:any)=>String(x)):[]; if(args.some((x:string)=>x.includes("\0"))) throw new Error("PROJECT_CHECK_BLOCKED: argumento contém NUL")
    const r=await run(exe,args,{cwd,timeout:120000}); if(!allowed.includes(r.code)) throw new Error(`PROJECT_CHECK_FAILED exit=${r.code}\n${r.stderr}`)
    return {status:validationAuthority?"PROJECT_CHECK_VALIDATED":"DIAGNOSTIC_CHECK_COMPLETED",evidence_state:validationAuthority?"VALIDADO":"OBSERVADO",validation_authority:validationAuthority,acceptance_authority:false,owner:expectedOwner,runner:"process",exit_code:r.code,stdout:r.stdout,stderr:r.stderr}
  }
  if(c.runner==="docker") {
    const mode=String(c.project_mount_mode||"ro"); if(mode!=="ro"&&mode!=="rw") throw new Error("PROJECT_CHECK_BLOCKED: mount mode inválido"); if(mode==="rw" && c.allow_workspace_writes!==true) throw new Error("PROJECT_CHECK_BLOCKED: rw sem allow_workspace_writes")
    const image=safeImageRef(String(c.image||""))
    const target=safeContainerPath(String(c.project_mount_target||"/workspace"),"mount target")
    const workdir=safeContainerPath(String(c.workdir||target),"workdir")
    const args=["run","--rm"]
    if(c.network) args.push("--network",safeNetwork(String(c.network)))
    args.push("--mount",`type=bind,source=${root},target=${target}${mode==="ro"?",readonly":""}`)
    args.push("-w",workdir,image,...(Array.isArray(c.command)?c.command.map(String):[]))
    const r=await run("docker",args,{cwd:root,timeout:180000}); if(!allowed.includes(r.code)) throw new Error(`PROJECT_CHECK_FAILED exit=${r.code}\n${r.stderr}`)
    return {status:validationAuthority?"PROJECT_CHECK_VALIDATED":"DIAGNOSTIC_CHECK_COMPLETED",evidence_state:validationAuthority?"VALIDADO":"OBSERVADO",validation_authority:validationAuthority,acceptance_authority:false,owner:expectedOwner,runner:"docker",exit_code:r.code,stdout:r.stdout,stderr:r.stderr}
  }
  throw new Error(`PROJECT_CHECK_BLOCKED: runner '${c.runner}' não suportado`)
}

async function vcsPolicy(root:string) {
  const p=path.join(root,".ai","vcs-policy.json"); if(!(await exists(p))) throw new Error("VCS_BLOCKED: .ai/vcs-policy.json ausente")
  const v=await readJson(p); if(v.authorized!==true) throw new Error("VCS_BLOCKED: policy authorized=false"); return v
}
async function currentBranch(root:string) { const r=await run("git",["-C",root,"rev-parse","--abbrev-ref","HEAD"],{cwd:root}); if(r.code!==0) throw new Error(r.stderr||"git branch failed"); return r.stdout.trim() }
function protectedBranch(policy:Json,branch:string) { const list=policy.protected_branches || ["main","master"]; return Array.isArray(list) && list.includes(branch) }

// OpenCode V2 native Promise plugin contract. Local plugins are expected to import
// Plugin.define from the host SDK; this keeps the plugin aligned with the runtime loader.
export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx: Plugin.Context) {
    const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
    const capabilityRegistry=await readJson(path.join(pluginRoot,"capabilities.json"))
    const agentTools: Record<string, readonly string[]> = capabilityRegistry.agents || {}
    const hideCore: Record<string, readonly string[]> = capabilityRegistry.hide_core_tools || {}
    const registered = Object.keys(capabilityRegistry.tools || {})
    await ctx.storage.set("runtime/version",{plugin:VERSION,opencode:ctx.app?.version,loaded_at:now()})

    await ctx.agent.transform((draft:any)=>{
      if(draft.get("orchestrator")) draft.default("orchestrator")
      for(const id of Object.keys(agentTools)) { const a=draft.get(id); if(a) draft.update(id,(agent:any)=>{ agent.description = `${agent.description || id} [ADE v${VERSION} native capabilities]` }) }
    })

    const generationBudgets:Record<string,number>=capabilityRegistry.generation_max_tokens || {}
    await ctx.session.hook("context",(event:any)=>{
      const allowed=new Set(agentTools[event.agent] || [])
      for(const name of Object.keys(event.tools || {})) if(name.startsWith(TOOL_PREFIX) && !allowed.has(name)) delete event.tools[name]
      for(const name of hideCore[event.agent] || []) delete event.tools[name]
      const budget=Number(generationBudgets[event.agent]||0); if(budget>0) event.generation.maxTokens=budget
    })

    await ctx.session.hook("retry",(event:any)=>{
      const message=String(event.error?.message||"")
      const autoOnly=event.error?.type==="provider.invalid-request" && /tool[_ ]choice/i.test(message) && /only[^\n]*auto/i.test(message)
      if(autoOnly && Number(event.attempt||0)<3){ event.decision={retry:true,delay:400}; return }
      if(autoOnly || Number(event.attempt||0)>=3) event.decision={retry:false}
    })

    await ctx.permission.hook("evaluate",(event:any)=>{
      const agent=String(event.agent||""); const allowed=new Set(agentTools[agent] || [])
      if(String(event.action).startsWith(TOOL_PREFIX) && !allowed.has(String(event.action))) { event.effect="deny"; event.message=`ADE_CAPABILITY_DENIED: ${agent} não possui ${event.action}`; return }
      if((hideCore[agent] || []).includes("shell") && event.action==="shell") { event.effect="deny"; event.message=`ADE_CAPABILITY_DENIED: raw shell não pertence a ${agent}` }
    })

    const executeTracker=async(i:any, mode:"read"|"write")=>{
      const root=projectRoot(ctx,i)
      const readActions=new Set(["discover","list","get"])
      const writeActions=new Set(["create","update","comment","transition","link-pr","sync"])
      if(mode==="read"&&!readActions.has(i.action)) throw new Error(`TRACKER_BLOCKED: action '${i.action}' não é read`)
      if(mode==="write"&&!writeActions.has(i.action)) throw new Error(`TRACKER_BLOCKED: action '${i.action}' não é write`)
      const trackerPolicyPath=path.join(root,".ai","tracker-policy.json")
      const trackerPolicy=await readJson(trackerPolicyPath)
      if(mode==="read"&&trackerPolicy.read?.authorized!==true) throw new Error("TRACKER_BLOCKED: tracker read unauthorized")
      if(mode==="write"&&!i.dry_run&&trackerPolicy.write?.authorized!==true) throw new Error("TRACKER_BLOCKED: tracker write unauthorized")
      const cfg=await readJson(path.join(root,".ai","integrations.json"))
      const provider=String(cfg.work_management?.provider||"none")
      if(provider==="none")throw new Error("TRACKER_BLOCKED: provider none")
      const providerCfg=cfg.work_management?.[provider] || {}
      const connectionId=String(providerCfg.connection_id || provider)
      const ps=await findPowerShell(root)
      const script=path.join(pluginRoot,"compat-runtime","work-management.ps1")
      if(!(await exists(script)))throw new Error("TRACKER_BLOCKED: compatibility work-management.ps1 ausente")
      const args=["-NoProfile","-ExecutionPolicy","Bypass","-File",script,"-ProjectRoot",root,"-Action",i.action]
      const map:any={internal_id:"-InternalId",external_id:"-ExternalId",title:"-Title",body:"-Body",status:"-Status",url:"-Url",query:"-Query"}
      for(const [k,flag] of Object.entries(map))if(i[k])args.push(String(flag),String(i[k]))
      if(i.dry_run)args.push("-DryRun")
      const env={...process.env}
      const secret=await integrationSecret(ctx,connectionId)
      if(secret){if(provider==="github")env.GH_TOKEN=secret;if(provider==="linear")env.LINEAR_API_KEY=secret;if(provider==="jira")env.JIRA_API_TOKEN=secret}
      if(provider==="jira" && typeof providerCfg.email==="string" && providerCfg.email.trim()) env.JIRA_EMAIL=providerCfg.email.trim()
      const r=await run(ps,args,{cwd:root,env,timeout:120000})
      if(r.code!==0)throw new Error(r.stderr||r.stdout)
      let parsed:any; try{parsed=JSON.parse(r.stdout)}catch{parsed={raw:r.stdout}}
      return {status:"OBSERVADO",provider,mode,backend:"typed-plugin/v4-compat",result:parsed}
    }

    await ctx.tool.transform((draft:any)=>{
      const add=(name:string,description:string,input:Json,execute:(input:Json,tool:any)=>Promise<Json>)=>draft.add({
        name:name.replace(/^ade_/,""), description, input,
        options:{namespace:"ade",codemode:false,permission:name},
        execute:async(i:any,t:any)=>{
          const started=Date.now(); let root=""; let status="completed"
          try {
            const scope=await resolveSessionScope(ctx,String(t?.sessionID||"")); root=scope.root
            const scoped={...i,__ade_root:scope.root,__ade_location:scope.location,__ade_canonical:scope.canonical}
            const value=await execute(scoped,t)
            return result(value)
          } catch(e) {
            status="blocked"
            return result({status:"BLOCKED",error:asError(e)})
          } finally {
            if(root){try{await appendJsonl(controlPaths(root).telemetry,{ts:now(),session_id:String(t?.sessionID||""),agent:String(t?.agent||"unknown"),tool:name,status,duration_ms:Date.now()-started})}catch{}}
          }
        },
      })
      add("ade_status","Read compact canonical ADE state and routing hint.",schemaObject({}),async i=>{const root=projectRoot(ctx,i); const control=await getControl(root); return {plugin:{id:PLUGIN_ID,version:VERSION,opencode:ctx.app?.version},project_root:root,...compactControl(control)}})
      add("ade_route_snapshot","Return the minimal state-driven routing decision for the current ADE state.",schemaObject({}),async i=>{const root=projectRoot(ctx,i),control=await getControl(root); return {status:"OBSERVADO",revision:Number(control.revision||0),global_status:control.global_status,routing_hint:routingHint(control),planes:{product:compactPlane(control.product),delivery:compactPlane(control.delivery),engineering:compactPlane(control.engineering)}}})
      add("ade_doctor","Inspect ADE/OpenCode native runtime without exposing credentials.",schemaObject({}),async i=>{const root=projectRoot(ctx,i); const agentsR=await ctx.agent.list({location:i.__ade_location}); const skillsR=await ctx.skill.list({location:i.__ade_location}); const pluginsR=await ctx.plugin.list({location:i.__ade_location}); const agents=agentsR.data||[],skills=skillsR.data||[],plugins=pluginsR.data||[]; let vcs:any; try{const r=await ctx.vcs.get({location:i.__ade_location});vcs=r.data}catch(e){vcs={error:asError(e)}}; return {status:"ADE_DOCTOR_OK",version:VERSION,opencode:ctx.app?.version,project_root:root,canonical_root:i.__ade_canonical,agents_present:Object.keys(agentTools).filter(id=>agents.some((a:any)=>a.id===id||a.name===id)),skill_present:skills.some((x:any)=>x.id==="ai-driven-engineering"),plugin_present:plugins.some((x:any)=>String(x.id||x.name||"").includes("ai-driven-engineering")),vcs,ai_control:await exists(path.join(root,".ai","control.json")),tools_registered:registered}})
      add("ade_vcs_status","Read working-copy status through OpenCode VCS API.",schemaObject({}),async i=>{const r=await ctx.vcs.status({location:i.__ade_location});return {status:"OBSERVADO",changes:r.data,location:r.location}})
      add("ade_vcs_diff","Read repository diff through OpenCode VCS API.",schemaObject({mode:str({enum:["working","branch","committed"]}),base:str(),context:integer({minimum:0,maximum:20})}),async i=>{const r=await ctx.vcs.diff({location:i.__ade_location,mode:i.mode||"working",base:i.base||undefined,context:i.context??3});return {status:"OBSERVADO",diff:r.data,location:r.location}})
      add("ade_vcs_branches","List repository branches through OpenCode VCS API.",schemaObject({search:str(),limit:integer({minimum:1,maximum:100})}),async i=>{const r=await ctx.vcs.branches({location:i.__ade_location,search:i.search||undefined,limit:i.limit||20});return {status:"OBSERVADO",branches:r.data,location:r.location}})
      add("ade_runtime_observe","Observe container/image runtime without mutation.",schemaObject({kind:str({enum:["containers","image"]}),image:str()},["kind"]),async i=>{const root=projectRoot(ctx,i); const image=i.kind==="image"?safeImageRef(String(i.image||"")):""; const args=i.kind==="containers"?["ps","--format","{{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"]:["image","inspect",image,"--format","{{.Id}}\t{{json .RepoTags}}\t{{.Size}}\t{{.Created}}"] ; if(i.kind==="image"&&!i.image)throw new Error("image obrigatório"); const r=await run("docker",args,{cwd:root,timeout:15000}); return {status:r.code===0?"OBSERVADO":"DESCONHECIDO",fields:i.kind==="containers"?["id","image","name","status","ports"]:["id","repo_tags","size","created"],exit_code:r.code,stdout:r.stdout,stderr:r.stderr}})
      add("ade_self_check","Run a non-destructive syntax/parse self-check. Does not grant validation authority.",schemaObject({kind:str({enum:["php-syntax","json-parse","python-syntax","node-syntax"]}),path:str()},["kind","path"]),async i=>{const root=projectRoot(ctx,i),file=await safeExistingRealPath(root,i.path,"self-check path"); let out:any={status:"SELF_CHECK_PASSED",evidence_state:"OBSERVADO",validation_authority:false,acceptance_authority:false,kind:i.kind,path:path.relative(root,file)}; if(i.kind==="json-parse"){JSON.parse(await fs.readFile(file,"utf8"));return out} let exe:string,args:string[]; if(i.kind==="php-syntax"){exe="php";args=["-l",file]} else if(i.kind==="python-syntax"){exe=process.platform==="win32"?"python":"python3";args=["-c","import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'), sys.argv[1], 'exec')",file]} else {exe="node";args=["--check",file]} const r=await run(exe,args,{cwd:root,timeout:30000}); if(r.code!==0)throw new Error(`${i.kind} failed: ${r.stderr||r.stdout}`); return {...out,stdout:r.stdout}})
      add("ade_project_check","Execute one authorized verifier-owned project check from .ai/execution-policy.json.",schemaObject({name:str()},["name"]),async i=>nativeProjectCheck(projectRoot(ctx,i),i.name,"verifier",true))
      add("ade_diagnostic_check","Execute one authorized non-destructive project check for diagnosis without validation authority.",schemaObject({name:str()},["name"]),async i=>nativeProjectCheck(projectRoot(ctx,i),i.name,"debugger",false))
      add("ade_state_get","Read canonical control state; compact by default, full only when explicitly required.",schemaObject({detail:str({enum:["compact","full"]})}),async i=>{const s=await getControl(projectRoot(ctx,i));return i.detail==="full"?{status:"OBSERVADO",control:s}:{status:"OBSERVADO",control:compactControl(s)}})
      add("ade_product_transition","Apply a valid Product-plane state transition.",schemaObject({target:str(),note:str(),evidence:stringArray()},["target"]),async i=>transition(projectRoot(ctx,i),"product",i.target,i.note||"",i.evidence||[]))
      add("ade_delivery_transition","Apply a valid Delivery-plane state transition.",schemaObject({target:str(),note:str(),evidence:stringArray()},["target"]),async i=>transition(projectRoot(ctx,i),"delivery",i.target,i.note||"",i.evidence||[]))
      add("ade_engineering_transition","Apply a valid Engineering-plane state transition.",schemaObject({target:str(),note:str(),evidence:stringArray()},["target"]),async i=>transition(projectRoot(ctx,i),"engineering",i.target,i.note||"",i.evidence||[]))
      add("ade_evidence_record","Record canonical evidence in .ai/control.json and audit log.",schemaObject({plane:str({enum:["product","delivery","engineering","orchestration","runtime"]}),state:str({enum:["OBSERVADO","INFERIDO","PROPOSTO","DESCONHECIDO"]}),summary:str(),refs:stringArray()},["plane","state","summary"]),async i=>recordEvidence(projectRoot(ctx,i),i))
      add("ade_product_validation_record","Record revision-bound VALIDADO evidence for Product plane; only Product Owner receives this capability.",schemaObject({summary:str(),refs:stringArray()},["summary"]),async i=>recordPlaneValidation(projectRoot(ctx,i),i,"product",["AUTHORIZED_BY_REQUEST","APPROVED"]))
      add("ade_delivery_validation_record","Record revision-bound VALIDADO evidence for Delivery plane; only Project Manager receives this capability.",schemaObject({summary:str(),refs:stringArray()},["summary"]),async i=>recordPlaneValidation(projectRoot(ctx,i),i,"delivery",["IN_EXECUTION"]))
      add("ade_engineering_validation_record","Record revision-bound VALIDADO evidence for Engineering plane; only Verifier receives this capability.",schemaObject({summary:str(),refs:stringArray()},["summary"]),async i=>recordPlaneValidation(projectRoot(ctx,i),i,"engineering",["VERIFYING"]))
      add("ade_evidence_query","Query canonical evidence history with a small default window.",schemaObject({plane:str(),state:str(),limit:integer({minimum:1,maximum:50})}),async i=>{let e=await evidenceHistory(projectRoot(ctx,i)); if(i.plane)e=e.filter((x:any)=>x.plane===i.plane); if(i.state)e=e.filter((x:any)=>x.state===i.state); const limit=i.limit||5; return {status:"OBSERVADO",count:e.length,evidence:e.slice(-limit)}})
      add("ade_tracker_read","Read-only Delivery-plane tracker adapter.",schemaObject({action:str({enum:["discover","list","get"]}),external_id:str(),query:str()},["action"]),async i=>executeTracker(i,"read"))
      add("ade_tracker_write","Mutating Delivery-plane tracker adapter; write policy required unless dry_run.",schemaObject({action:str({enum:["create","update","comment","transition","link-pr","sync"]}),internal_id:str(),external_id:str(),title:str(),body:str(),status:str(),url:str(),query:str(),dry_run:bool()},["action"]),async i=>executeTracker(i,"write"))
      add("ade_vcs_stage","Stage explicit workspace paths under VCS policy.",schemaObject({paths:stringArray()},["paths"]),async i=>{const root=projectRoot(ctx,i),policy=await vcsPolicy(root); if(policy.stage?.allowed!==true)throw new Error("VCS_BLOCKED: stage disabled"); const paths=(i.paths||[]).map((p:string)=>relativeLiteralPath(root,p)); if(!paths.length)throw new Error("VCS_BLOCKED: paths vazios"); const r=await run("git",["-C",root,"--literal-pathspecs","add","--",...paths],{cwd:root}); if(r.code!==0)throw new Error(r.stderr); return {status:"VCS_STAGED",paths}})
      add("ade_vcs_commit","Create a non-amending commit under VCS policy.",schemaObject({message:str({minLength:1,maxLength:240})},["message"]),async i=>{const root=projectRoot(ctx,i),policy=await vcsPolicy(root); if(policy.commit?.allowed!==true)throw new Error("VCS_BLOCKED: commit disabled"); if(/[\r\n]/.test(i.message))throw new Error("VCS_BLOCKED: commit message multiline"); const b=await currentBranch(root); if(protectedBranch(policy,b)&&policy.commit?.allow_protected_branches!==true)throw new Error(`VCS_BLOCKED: protected branch ${b}`); const staged=await run("git",["-C",root,"diff","--cached","--quiet"],{cwd:root}); if(staged.code===0)throw new Error("VCS_BLOCKED: nada staged"); if(staged.code!==1)throw new Error(staged.stderr||"VCS_BLOCKED: staged diff check falhou"); await assertNoSecretStaged(root); const r=await run("git",["-C",root,"-c","commit.gpgSign=false","commit","--no-verify","-m",i.message],{cwd:root,timeout:120000}); if(r.code!==0)throw new Error(r.stderr||r.stdout); const sha=await run("git",["-C",root,"rev-parse","HEAD"],{cwd:root}); await appendJsonl(controlPaths(root).audit,{ts:now(),event:"vcs.commit",actor:"vcs-operator",status:"OBSERVADO",evidence_refs:[`git:${sha.stdout.trim()}`],branch:b}); return {status:"VCS_COMMITTED",sha:sha.stdout.trim(),branch:b}})
      add("ade_vcs_push","Push current branch to configured remote; force and arbitrary refspecs are impossible.",schemaObject({}),async i=>{const root=projectRoot(ctx,i),policy=await vcsPolicy(root); if(policy.push?.allowed!==true)throw new Error("VCS_BLOCKED: push disabled"); const b=await currentBranch(root); if(protectedBranch(policy,b)&&policy.push?.allow_protected_branches!==true)throw new Error(`VCS_BLOCKED: protected branch ${b}`); const remote=String(policy.push?.remote||"origin"); if(!/^[A-Za-z0-9._-]+$/.test(remote))throw new Error("VCS_BLOCKED: remote inválido"); const r=await run("git",["-C",root,"push","--no-verify","-u",remote,b],{cwd:root,timeout:120000}); if(r.code!==0)throw new Error(r.stderr||r.stdout); const sha=await run("git",["-C",root,"rev-parse","HEAD"],{cwd:root}); await appendJsonl(controlPaths(root).audit,{ts:now(),event:"vcs.push",actor:"vcs-operator",status:"VALIDADO",evidence_refs:[`git:${sha.stdout.trim()}`],branch:b,remote}); return {status:"VCS_PUSHED",sha:sha.stdout.trim(),branch:b,remote,force:false}})
      add("ade_pr_create","Create a GitHub pull request from current branch through OpenCode integration auth.",schemaObject({title:str({minLength:1,maxLength:240}),body:str(),base:str()},["title"]),async i=>{const root=projectRoot(ctx,i),policy=await vcsPolicy(root); if(policy.pull_request?.allowed!==true)throw new Error("VCS_BLOCKED: pull_request disabled"); const cfg=await readJson(path.join(root,".ai","integrations.json")); const g=cfg.work_management?.github||{}; const owner=String(g.owner||""),repo=String(g.repository||""); if(!owner||!repo)throw new Error("VCS_BLOCKED: github owner/repository ausente"); const token=await integrationSecret(ctx,String(g.connection_id||"github")); if(!token)throw new Error("VCS_BLOCKED: conexão GitHub autorizada do OpenCode indisponível"); const head=await currentBranch(root); const defaultBase=String(policy.pull_request?.base_branch||"main"); const allowedBases=Array.isArray(policy.pull_request?.allowed_base_branches)?policy.pull_request.allowed_base_branches.map(String):[defaultBase]; const base=String(i.base||defaultBase); if(!allowedBases.includes(base))throw new Error(`VCS_BLOCKED: base branch não autorizada: ${base}`); const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,{method:"POST",headers:{"accept":"application/vnd.github+json","authorization":`Bearer ${token}`,"x-github-api-version":"2022-11-28","content-type":"application/json"},body:JSON.stringify({title:i.title,body:i.body||"",head,base})}); const data:any=await response.json(); if(!response.ok)throw new Error(`GitHub PR failed ${response.status}: ${data?.message||"unknown"}`); await appendJsonl(controlPaths(root).audit,{ts:now(),event:"vcs.pull-request",actor:"vcs-operator",status:"OBSERVADO",evidence_refs:[String(data.html_url||"")],head,base}); return {status:"PR_CREATED",number:data.number,url:data.html_url,head,base}})
    })

    await ctx.command.transform((draft:any)=>{
      draft.add({name:"ade-init",description:"Initialize canonical .ai state for ADE v5. Usage: /ade-init [WORK-ITEM] [LEAN|STANDARD|HIGH_ASSURANCE]",execute:async({sessionID,prompt}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root;const req=parseInitRequest(prompt);const initialized=await initProject(root,pluginRoot,req.workItem,req.profile);await ctx.session.synthetic({sessionID,text:`ADE_INIT_OK v${VERSION}: ${initialized.ai} | work_item=${initialized.work_item_id} | profile=${initialized.profile} | created=${initialized.created.length} | preserved=${initialized.preserved.length}`})}})
      draft.add({name:"ade-status",description:"Show canonical ADE state",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root;try{const s=await getControl(root);await ctx.session.synthetic({sessionID,text:`ADE v${VERSION} | global=${s.global_status} | product=${s.product?.status} | delivery=${s.delivery?.status} | engineering=${s.engineering?.status}`})}catch(e){await ctx.session.synthetic({sessionID,text:`ADE_STATUS_BLOCKED: ${asError(e)}`})}}})
      draft.add({name:"ade-doctor",description:"Show native ADE runtime diagnostics without an LLM round-trip",execute:async({sessionID}:any)=>{const scope=await resolveSessionScope(ctx,String(sessionID)),root=scope.root;const agentsR=await ctx.agent.list({location:scope.location});const skillsR=await ctx.skill.list({location:scope.location});const pluginsR=await ctx.plugin.list({location:scope.location});const text={status:"ADE_DOCTOR_OK",version:VERSION,opencode:ctx.app?.version,project_root:root,agents_present:Object.keys(agentTools).filter(id=>(agentsR.data||[]).some((a:any)=>a.id===id||a.name===id)),skill_present:(skillsR.data||[]).some((x:any)=>x.id==="ai-driven-engineering"),plugin_present:(pluginsR.data||[]).some((x:any)=>String(x.id||x.name||"").includes("ai-driven-engineering")),ai_control:await exists(path.join(root,".ai","control.json")),tools_registered:registered};await ctx.session.synthetic({sessionID,text:JSON.stringify(text,null,2)})}})
      draft.add({name:"ade-why",description:"Explain the current state-driven routing hint",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,s=await getControl(root);await ctx.session.synthetic({sessionID,text:`ADE WHY | revision=${s.revision||0} | ${JSON.stringify(routingHint(s))}`})}})
      draft.add({name:"ade-trace",description:"Show recent ADE tool-routing telemetry",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,p=controlPaths(root).telemetry;const rows=(await readJsonl(p)).slice(-20);await ctx.session.synthetic({sessionID,text:`ADE_TRACE_LAST_20\n${rows.map((x:any)=>`${x.ts} agent=${x.agent} tool=${x.tool} status=${x.status} duration_ms=${x.duration_ms}`).join("\n")}`})}})
      draft.add({name:"ade-metrics",description:"Summarize recent ADE tool-call cost signals",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,rows=(await readJsonl(controlPaths(root).telemetry)).slice(-200);const byAgent:any={},byTool:any={};let blocked=0,totalMs=0;for(const x of rows){byAgent[x.agent]=(byAgent[x.agent]||0)+1;byTool[x.tool]=(byTool[x.tool]||0)+1;if(x.status!=="completed")blocked++;totalMs+=Number(x.duration_ms||0)}await ctx.session.synthetic({sessionID,text:JSON.stringify({window:rows.length,blocked,total_duration_ms:totalMs,by_agent:byAgent,by_tool:byTool},null,2)})}})
      draft.add({name:"ade-resume",description:"Resume from canonical .ai state via orchestrator",execute:async({sessionID,prompt,delivery}:any)=>{await ctx.session.switchAgent({sessionID,agent:"orchestrator"});await ctx.session.prompt({sessionID,text:"Retome o trabalho a partir de .ai/control.json, contracts, checkpoint, traceability e audit. Preserve gates/autoridades e continue automaticamente até DONE, gate real ou decisão humana genuína.",delivery})}})
      draft.add({name:"ade-audit",description:"Show recent canonical ADE audit events",execute:async({sessionID}:any)=>{const root=(await resolveSessionScope(ctx,String(sessionID))).root,p=controlPaths(root).audit;let lines:string[]=[];if(await exists(p))lines=(await fs.readFile(p,"utf8")).trim().split(/\r?\n/).slice(-20);await ctx.session.synthetic({sessionID,text:`ADE_AUDIT_LAST_20\n${lines.join("\n")}`})}})
    })

    return async()=>{ await ctx.storage.set("runtime/last_unload",{version:VERSION,at:now()}) }
  },
})
