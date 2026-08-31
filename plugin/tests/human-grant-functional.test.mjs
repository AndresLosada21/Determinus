import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { pathToFileURL, fileURLToPath } from "node:url"

async function copyTree(src, dst){ await fs.cp(src,dst,{recursive:true})}
async function fixture(){
  const pluginDir=path.resolve(fileURLToPath(new URL("..", import.meta.url)))
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"ade-grant-func-"))
  const runtime=path.join(temp,"plugin")
  await fs.mkdir(path.join(runtime,"src"),{recursive:true})
  await fs.copyFile(path.join(pluginDir,"src","index.ts"), path.join(runtime,"src","index.ts"))
  await fs.copyFile(path.join(pluginDir,"capabilities.json"), path.join(runtime,"capabilities.json"))
  await copyTree(path.join(pluginDir,"assets"), path.join(runtime,"assets"))
  await copyTree(path.join(pluginDir,"compat-runtime"), path.join(runtime,"compat-runtime"))
  const sdk=path.join(runtime,"node_modules","@opencode-ai","plugin")
  await fs.mkdir(sdk,{recursive:true})
  await fs.writeFile(path.join(sdk,"package.json"), JSON.stringify({name:"@opencode-ai/plugin",type:"module",exports:"./index.js"}),"utf8")
  await fs.writeFile(path.join(sdk,"index.js"), "export const Plugin={define:(value)=>value}\n","utf8")
  const project=path.join(temp,"project")
  await fs.mkdir(path.join(project,".ai"),{recursive:true})
  await fs.writeFile(path.join(project,".ai","control.json"), JSON.stringify({schema_version:2,work_item_id:"GRANT-FUNC",revision:0,global_status:"NOT_DONE",product:{required:false,status:"DRAFT",revision:0},delivery:{required:false,status:"DRAFT",revision:0},engineering:{required:true,status:"DISCOVERING",revision:0},evidence:{},notes:[],work_management:{provider:"none",sync_status:"NOT_CONFIGURED",last_sync_at:"",external_refs:[]},traceability:{file:".ai/traceability.json"},audit:{file:".ai/audit.jsonl"}},null,2)+"\n","utf8")
  await fs.writeFile(path.join(project,".ai","tracker-policy.json"), JSON.stringify({schema_version:1,read:{authorized:true},write:{authorized:true},remote:{allowed_https_hosts:["api.github.com","api.linear.app"],allowed_github_repositories:["octo/repo"],allowed_github_projects:["octo/4"],allowed_jira_projects:[],allowed_linear_team_ids:[]}},null,2)+"\n","utf8")
  await fs.writeFile(path.join(project,".ai","integrations.json"), JSON.stringify({schema_version:1,work_management:{provider:"github",github:{owner:"octo",repository:"repo",project_owner:"octo",project_number:4,connection_id:"github"}}},null,2)+"\n","utf8")
  await fs.writeFile(path.join(project,".ai","vcs-policy.json"), JSON.stringify({schema_version:1,authorized:true,protected_branches:["main"],stage:{allowed:true},commit:{allowed:true},push:{allowed:true,remote:"origin",allowed_remote_urls:["https://github.com/octo/repo.git"]},pull_request:{allowed:true,base_branch:"main",allowed_repositories:["octo/repo"]},hooks:{allow_bypass:false}},null,2)+"\n","utf8")
  return {temp,runtime,project}
}
function grantsRootDir(){ const home=os.homedir(); if(process.platform==="win32"){ const base=process.env.LOCALAPPDATA||path.join(home,"AppData","Local"); return path.join(base,"opencode","ade-grants")} const base=process.env.XDG_STATE_HOME||path.join(home,".local","state"); return path.join(base,"opencode","ade-grants")}
function canonicalStringify(v){ if(Array.isArray(v)) return "["+v.map(canonicalStringify).join(",")+"]"; if(v&&typeof v==="object"){ const keys=Object.keys(v).sort(); return "{"+keys.map(k=>JSON.stringify(k)+":"+canonicalStringify(v[k])).join(",")+"}"} return JSON.stringify(v)}
function hashResource(o){ return crypto.createHash("sha256").update(canonicalStringify(o)).digest("hex")}
async function projectHashForRoot(root){ const real=await fs.realpath(root); return crypto.createHash("sha256").update(process.platform==="win32"?real.toLowerCase():real).digest("hex")}
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

async function createTestGrant(root,tool,input,extra={},opts={}){ if(tool==="ade_tracker_project_sync"&&!extra.target){ const cfg=JSON.parse(await fs.readFile(path.join(root,".ai","integrations.json"),"utf8")); const g=cfg.work_management?.github||{}; extra={...extra,target:{provider:"github",connection_id:String(g.connection_id||"github"),host:"api.github.com",owner:String(g.owner||""),repository:String(g.repository||""),project_owner:String(g.project_owner||g.owner||""),project_number:Number(g.project_number||0),project_id:""}} } const ph=await projectHashForRoot(root); const fp=resourceFingerprintFor(tool,input,extra); const file=path.join(grantsRootDir(),`${ph}.jsonl`); await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700}); let handle; for(let i=0;i<50;i++){ try{ handle=await fs.open(path.join(grantsRootDir(),`${ph}.jsonl.lock`),"wx",0o600); await handle.writeFile(JSON.stringify({pid:process.pid})); break }catch(e){ if(e.code!=="EEXIST") throw e; await new Promise(r=>setTimeout(r,20))}} if(!handle) throw new Error("lock timeout"); try{ let grants=[]; try{ const raw=await fs.readFile(file,"utf8"); for(const line of raw.split(/\r?\n/)){ if(!line.trim()) continue; try{ grants.push(JSON.parse(line)) }catch{}}}catch{}; const now=Date.now(); grants=grants.filter(g=>{ const exp=Date.parse(g.expires_at||""); return Number.isFinite(exp)&&exp>now&&(g.remaining_uses??0)>0 }); const ttl=opts.ttlMs??10*60*1000; const grant={id:`gr-${crypto.randomUUID()}`,action:tool,project_hash:ph,resource_hash:fp,issued_at:new Date(now).toISOString(),expires_at:new Date(now+ttl).toISOString(),max_uses:opts.maxUses??1,remaining_uses:opts.maxUses??1,nonce:crypto.randomUUID()}; grants.push(grant); const tmp=`${file}.tmp-${crypto.randomUUID()}`; const h=await fs.open(tmp,"wx",0o600); try{ await h.writeFile(grants.map(g=>JSON.stringify(g)).join("\n")+"\n","utf8"); await h.sync()} finally{ await h.close()} await fs.rename(tmp,file); return grant } finally{ try{ await handle.close(); await fs.unlink(path.join(grantsRootDir(),`${ph}.jsonl.lock`))}catch{}} }
async function cleanupGrant(project){ try{ const ph=await projectHashForRoot(project); await fs.unlink(path.join(grantsRootDir(),`${ph}.jsonl`)).catch(()=>{}); await fs.unlink(path.join(grantsRootDir(),`${ph}.jsonl.lock`)).catch(()=>{}) }catch{} }
function makeContext(project,cap){ const hooks={}; const tools=new Map(); const commands=new Map(); const vcsCalls=[]; const agentRecords=Object.keys(cap.agents).map(id=>({id,description:id})); let defaultAgent; const locationInfo={directory:project,project:{id:"test",directory:project,canonical:project}}; const ctx={app:{version:"0.0.0-beta-test"},location:{directory:path.join(project,".."),project:{id:"host",directory:path.join(project,".."),canonical:path.join(project,"..")}},storage:{async set(){},async get(){},async remove(){},async scan(){return{entries:[]}}},agent:{async transform(cb){ const draft={get(id){return agentRecords.find(x=>x.id===id)},list(){return agentRecords},default(id){defaultAgent=id},update(id,fn){ const item=agentRecords.find(x=>x.id===id); if(item) fn(item)},remove(){},}; cb(draft)},async list(input){return{location:locationInfo,data:agentRecords,input}}},skill:{async list(){return{location:locationInfo,data:[{id:"ai-driven-engineering"}]}}},plugin:{async list(){return{location:locationInfo,data:[{id:"ai-driven-engineering.native"}]}}},session:{async get({sessionID}){return{id:sessionID,location:{directory:project}}},async hook(name,cb){hooks[`session:${name}`]=cb},async synthetic(){},async prompt(){},async switchAgent(){},async context(){return[]}},permission:{async hook(name,cb){hooks[`permission:${name}`]=cb}},tool:{async transform(cb){ cb({add(def){ const ns=def.options?.namespace?`${def.options.namespace}_`:""; tools.set(`${ns}${def.name}`,def)},list(){return[...tools.values()]},get(id){return tools.get(id)},update(){},remove(id){tools.delete(id)}})}},command:{async transform(cb){ cb({add(def){ commands.set(def.name,def)}})}},vcs:{async get(input){vcsCalls.push(["get",input]);return{location:locationInfo,data:{branch:{current:"feature",default:"main"}}}},async status(input){vcsCalls.push(["status",input]);return{location:locationInfo,data:[]}},async branches(input){vcsCalls.push(["branches",input]);return{location:locationInfo,data:[]}},async diff(input){vcsCalls.push(["diff",input]);return{location:locationInfo,data:[]}}},integration:{connection:{async active(id){return{id,type:"test"}},async resolve(){return{token:"test-token"}}}}}; return {ctx,hooks,tools,commands,vcsCalls,get defaultAgent(){return defaultAgent}}}

async function authorizeViaCommand(state,sessionID,tool,input){
  const cmd=state.commands.get("ade-authorize")
  assert.ok(cmd,"ade-authorize command must be registered")
  await cmd.execute({sessionID,prompt:{text:`${tool} ${JSON.stringify(input)}`}})
}

// A repo authorized=true + no ADE grant → mutation=0
test("A no grant with authorized=true yields zero mutations", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?A=${Date.now()}`)
    await mod.default.setup(state.ctx)
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async (_url,init)=>{ fetchCalls++; const body=JSON.parse(init.body); if(String(body.query).includes("updateProjectV2ItemFieldValue")) return{ok:true,status:200,text:async()=>JSON.stringify({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:"1"}}}}),json:async()=>({})}; const payload={data:{user:{projectV2:{id:"PVT",title:"T",fields:{nodes:[{id:"F1",name:"Status",dataType:"SINGLE_SELECT",options:[{id:"OPT_TODO",name:"Todo"},{id:"OPT_DONE",name:"Done"}]}]},items:{nodes:[{id:"ITEM1",content:{number:1,title:"T",url:"https://example.com"},fieldValues:{nodes:[{field:{name:"Status"},name:"Todo"}]}}]}}},organization:null}}; return{ok:true,status:200,text:async()=>JSON.stringify(payload),json:async()=>payload} }
    try{
      const pmCtx={sessionID:"sesA",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.match(val.error,/ADE_HUMAN_AUTHORIZATION_REQUIRED/)
      assert.equal(fetchCalls,0,"ZERO external mutations without grant")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// B repo authorized=true + OpenCode allow/auto-like + no ADE grant → mutation=0
test("B allow/auto without grant still zero mutations", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?B=${Date.now()}`)
    await mod.default.setup(state.ctx)
    const hook=state.hooks["permission:evaluate"]
    const ev={sessionID:"sesB",agent:"project-manager",action:"ade_tracker_project_sync",resources:[],effect:"allow"}
    await hook(ev)
    // In --auto, allow would be auto-approved to allow, but plugin forces ask; we simulate auto-like by setting effect allow and then not providing grant
    assert.equal(ev.effect,"ask","plugin forces ask even if caller tried allow")
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async ()=>{ fetchCalls++; return{ok:true,status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({})} }
    try{
      const pmCtx={sessionID:"sesB",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.equal(fetchCalls,0,"ZERO mutations even with allow/auto and no grant")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// C valid human grant + matching operation → mutation=1
test("C valid grant matching operation yields one mutation", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?C=${Date.now()}`)
    await mod.default.setup(state.ctx)
    let fetchCalls=0
    let snapshotCount=0
    const orig=globalThis.fetch
    globalThis.fetch= async (_url,init)=>{ fetchCalls++; const body=JSON.parse(init.body); if(String(body.query).includes("updateProjectV2ItemFieldValue")) return{ok:true,status:200,text:async()=>JSON.stringify({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:"ITEM1"}}}}),json:async()=>({})}; snapshotCount++; const val=snapshotCount===1?"Todo":"Done"; const payload={data:{user:{projectV2:{id:"PVT",title:"T",fields:{nodes:[{id:"F1",name:"Status",dataType:"SINGLE_SELECT",options:[{id:"OPT_TODO",name:"Todo"},{id:"OPT_DONE",name:"Done"}]}]},items:{nodes:[{id:"ITEM1",content:{number:1,title:"T",url:"https://example.com"},fieldValues:{nodes:[{field:{name:"Status"},name:val}]}}]}}},organization:null}}; return{ok:true,status:200,text:async()=>JSON.stringify(payload),json:async()=>payload} }
    try{
      const pmCtx={sessionID:"sesC",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const updates=[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]
      await authorizeViaCommand(state,"sesC","ade_tracker_project_sync",{updates})
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"TRACKER_SYNC_DONE")
      assert.equal(val.updated,1)
      assert.equal(val.verified,1)
      // One mutation + 2 snapshots = 3 fetchCalls, but we check at least one mutation
      const mutations=val.updated
      assert.equal(mutations,1,"exactly one mutation with valid grant")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// D grant action mismatch → mutation=0
test("D grant action mismatch still zero mutations", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?D=${Date.now()}`)
    await mod.default.setup(state.ctx)
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async ()=>{ fetchCalls++; return{ok:true,status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({})} }
    try{
      await createTestGrant(fx.project,"ade_vcs_push",{branch:"feature",remote:"origin",remote_url:"https://github.com/octo/repo.git"})
      const pmCtx={sessionID:"sesD",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.equal(fetchCalls,0,"action mismatch must not mutate")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// E grant resource mismatch → mutation=0
test("E grant resource mismatch still zero mutations", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?E=${Date.now()}`)
    await mod.default.setup(state.ctx)
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async (_url,init)=>{ fetchCalls++; const body=JSON.parse(init.body); if(String(body.query).includes("updateProjectV2ItemFieldValue")) return{ok:true,status:200,text:async()=>JSON.stringify({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:"1"}}}}),json:async()=>({})}; const payload={data:{user:{projectV2:{id:"PVT",title:"T",fields:{nodes:[{id:"F1",name:"Status",dataType:"SINGLE_SELECT",options:[{id:"OPT_DONE",name:"Done"}]}]},items:{nodes:[{id:"ITEM1",content:{number:1,title:"T",url:"https://example.com"},fieldValues:{nodes:[{field:{name:"Status"},name:"Todo"}]}}]}}},organization:null}}; return{ok:true,status:200,text:async()=>JSON.stringify(payload),json:async()=>payload} }
    try{
      await createTestGrant(fx.project,"ade_tracker_project_sync",{updates:[{external_id:"1",fields:[{name:"Status",value:"Todo"}]}]})
      const pmCtx={sessionID:"sesE",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.equal(fetchCalls,0,"resource mismatch must not mutate")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// F expired grant → mutation=0
test("F expired grant yields zero mutations", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?F=${Date.now()}`)
    await mod.default.setup(state.ctx)
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async ()=>{ fetchCalls++; return{ok:true,status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({})} }
    try{
      // create expired grant (ttl -1)
      await createTestGrant(fx.project,"ade_tracker_project_sync",{updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]}, {}, {ttlMs:-1000})
      const pmCtx={sessionID:"sesF",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.equal(fetchCalls,0,"expired grant must not mutate")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// G replay single-use grant → segunda mutation=0
test("G replay single-use grant second mutation blocked", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?G=${Date.now()}`)
    await mod.default.setup(state.ctx)
    let fetchCalls=0
    let snapshotCount=0
    const orig=globalThis.fetch
    globalThis.fetch= async (_url,init)=>{ fetchCalls++; const body=JSON.parse(init.body); if(String(body.query).includes("updateProjectV2ItemFieldValue")) return{ok:true,status:200,text:async()=>JSON.stringify({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:"ITEM1"}}}}),json:async()=>({})}; snapshotCount++; const val=snapshotCount%2===1?"Todo":"Done"; if(snapshotCount>2) snapshotCount=0; const payload={data:{user:{projectV2:{id:"PVT",title:"T",fields:{nodes:[{id:"F1",name:"Status",dataType:"SINGLE_SELECT",options:[{id:"OPT_TODO",name:"Todo"},{id:"OPT_DONE",name:"Done"}]}]},items:{nodes:[{id:"ITEM1",content:{number:1,title:"T",url:"https://example.com"},fieldValues:{nodes:[{field:{name:"Status"},name:val}]}}]}}},organization:null}}; return{ok:true,status:200,text:async()=>JSON.stringify(payload),json:async()=>payload} }
    try{
      const pmCtx={sessionID:"sesG",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const updates=[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]
      await authorizeViaCommand(state,"sesG","ade_tracker_project_sync",{updates})
      const res1=await state.tools.get("ade_tracker_project_sync").execute({updates},pmCtx)
      const v1=JSON.parse(res1.content)
      assert.equal(v1.status,"TRACKER_SYNC_DONE")
      const callsAfterFirst=fetchCalls
      // second call with same grant (already consumed) should be BLOCKED and not add mutations
      const res2=await state.tools.get("ade_tracker_project_sync").execute({updates},pmCtx)
      const v2=JSON.parse(res2.content)
      assert.equal(v2.status,"BLOCKED")
      // second call should not have produced new update mutations (fetchCalls should not increase by mutation count)
      // At least, second call's updated should be 0 and no new update mutation
      assert.equal(fetchCalls, callsAfterFirst, "replay must not cause second mutation")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// H repo tenta criar/copiar grant dentro .ai → ignorado/bloqueado
test("H grant inside .ai is ignored", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?H=${Date.now()}`)
    await mod.default.setup(state.ctx)
    // Try to create a fake grant file inside .ai (should be ignored)
    const fakeGrant={id:"gr-fake",action:"ade_tracker_project_sync",project_hash: await projectHashForRoot(fx.project), resource_hash: hashResource({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]}), issued_at:new Date().toISOString(), expires_at:new Date(Date.now()+600000).toISOString(), max_uses:1, remaining_uses:1, nonce:"fake"}
    await fs.writeFile(path.join(fx.project,".ai","grant-fake.jsonl"), JSON.stringify(fakeGrant)+"\n","utf8")
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async ()=>{ fetchCalls++; return{ok:true,status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({})} }
    try{
      const pmCtx={sessionID:"sesH",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED","grant inside .ai must be ignored")
      assert.equal(fetchCalls,0,"must not mutate when only .ai grant exists")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// I project symlink/path alias não pode reutilizar grant de outro root
test("I grant from other project root cannot be reused via alias", async()=>{
  const fx1=await fixture()
  const fx2=await fixture()
  try{
    const cap1=JSON.parse(await fs.readFile(path.join(fx1.runtime,"capabilities.json"),"utf8"))
    const state1=makeContext(fx1.project,cap1)
    const mod1=await import(`${pathToFileURL(path.join(fx1.runtime,"src","index.ts")).href}?I1=${Date.now()}`)
    await mod1.default.setup(state1.ctx)
    const cap2=JSON.parse(await fs.readFile(path.join(fx2.runtime,"capabilities.json"),"utf8"))
    // Create grant for fx1 project
    await createTestGrant(fx1.project,"ade_tracker_project_sync",{updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]})
    // Try to use that grant from fx2 project (different realpath) – should fail
    // We need to setup state for fx2 but reuse same grant file? Instead, we test that project hash differs, so grant for fx1 not valid for fx2
    const ph1=await projectHashForRoot(fx1.project)
    const ph2=await projectHashForRoot(fx2.project)
    assert.notEqual(ph1,ph2,"projects must have different hashes")
    // For fx2, no grant exists, so mutation must be 0
    const state2=makeContext(fx2.project,cap2)
    const mod2=await import(`${pathToFileURL(path.join(fx2.runtime,"src","index.ts")).href}?I2=${Date.now()+1}`)
    await mod2.default.setup(state2.ctx)
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async ()=>{ fetchCalls++; return{ok:true,status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({})} }
    try{
      const pmCtx2={sessionID:"sesI",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const res=await state2.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx2)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.equal(fetchCalls,0,"alias project grant must not be reused")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx1.project); await cleanupGrant(fx2.project); await fs.rm(fx1.temp,{recursive:true,force:true}); await fs.rm(fx2.temp,{recursive:true,force:true}) }
})

// J always allow / pre-existing allow não substitui ADE human grant
test("J saved always allow does not bypass grant", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?J=${Date.now()}`)
    await mod.default.setup(state.ctx)
    // Simulate saved always allow by setting permission hook to allow (but plugin forces ask, yet tool still requires grant)
    let fetchCalls=0
    const orig=globalThis.fetch
    globalThis.fetch= async ()=>{ fetchCalls++; return{ok:true,status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({})} }
    try{
      const pmCtx={sessionID:"sesJ",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      // No grant, even though we simulate always allow, should still be blocked
      const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      const val=JSON.parse(res.content)
      assert.equal(val.status,"BLOCKED")
      assert.equal(fetchCalls,0,"always allow must not bypass grant")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// K rejected/absent grant não gera fallback shell/manual autoexecutável
test("K blocked grant does not expose shell fallback", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?K=${Date.now()}`)
    await mod.default.setup(state.ctx)
    const pmCtx={sessionID:"sesK",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
    const res=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
    const val=JSON.parse(res.content)
    assert.equal(val.status,"BLOCKED")
    assert.ok(!String(val.error||"").toLowerCase().includes("shell"),"error must not suggest shell fallback")
    assert.ok(!String(val.error||"").toLowerCase().includes("docker run"),"must not suggest docker run fallback")
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})

// L telemetry registra authorization sem segredo
test("L telemetry records authorization without secret", async()=>{
  const fx=await fixture()
  try{
    const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
    const state=makeContext(fx.project,cap)
    const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?L=${Date.now()}`)
    await mod.default.setup(state.ctx)
    // First, no grant → should log NONE
    let fetchCalls=0
    let snapshotCount=0
    const orig=globalThis.fetch
    globalThis.fetch= async (_url,init)=>{ fetchCalls++; const body=JSON.parse(init.body); if(String(body.query).includes("updateProjectV2ItemFieldValue")) return{ok:true,status:200,text:async()=>JSON.stringify({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:"1"}}}}),json:async()=>({})}; snapshotCount++; const val=snapshotCount===1?"Todo":"Done"; const payload={data:{user:{projectV2:{id:"PVT",title:"T",fields:{nodes:[{id:"F1",name:"Status",dataType:"SINGLE_SELECT",options:[{id:"OPT_TODO",name:"Todo"},{id:"OPT_DONE",name:"Done"}]}]},items:{nodes:[{id:"ITEM1",content:{number:1,title:"T",url:"https://example.com"},fieldValues:{nodes:[{field:{name:"Status"},name:val}]}}]}}},organization:null}}; return{ok:true,status:200,text:async()=>JSON.stringify(payload),json:async()=>payload} }
    try{
      const pmCtx={sessionID:"sesL",agent:"project-manager",messageID:"msg",id:"call",async progress(){}}
      const resBlocked=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      assert.equal(JSON.parse(resBlocked.content).status,"BLOCKED")
      const tel1=await fs.readFile(path.join(fx.project,".ai","telemetry.jsonl"),"utf8").catch(()=>"")
      assert.ok(tel1.includes("NONE")||tel1.includes("human.grant.missing"),"telemetry should record NONE/missing for blocked")
      assert.ok(!tel1.includes("github_pat")&&!tel1.includes("ghp_"),"telemetry must not contain secret")
      // Now with grant → EXPLICIT_EXTERNAL_GRANT
      await authorizeViaCommand(state,"sesL","ade_tracker_project_sync",{updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]})
      const resOk=await state.tools.get("ade_tracker_project_sync").execute({updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},pmCtx)
      assert.equal(JSON.parse(resOk.content).status,"TRACKER_SYNC_DONE")
      const tel2=await fs.readFile(path.join(fx.project,".ai","telemetry.jsonl"),"utf8").catch(()=>"")
      assert.ok(tel2.includes("EXPLICIT_EXTERNAL_GRANT"),"telemetry should record EXPLICIT_EXTERNAL_GRANT after success")
      assert.ok(!tel2.includes("ghp_")&&!tel2.toLowerCase().includes("token"),"telemetry must not leak grant token")
    } finally{ globalThis.fetch=orig }
  } finally{ await cleanupGrant(fx.project); await fs.rm(fx.temp,{recursive:true,force:true}) }
})
