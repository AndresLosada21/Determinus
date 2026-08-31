import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { pathToFileURL, fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

async function copyTree(src,dst){await fs.cp(src,dst,{recursive:true})}
async function fixture(){
  const pluginDir=path.resolve(fileURLToPath(new URL("..",import.meta.url)))
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"ade-v6-kernel-")),runtime=path.join(temp,"plugin"),project=path.join(temp,"project")
  await fs.mkdir(path.join(runtime,"src"),{recursive:true})
  for(const f of ["src/index.ts","capabilities.json"])await fs.copyFile(path.join(pluginDir,f),path.join(runtime,f))
  await copyTree(path.join(pluginDir,"assets"),path.join(runtime,"assets"));await copyTree(path.join(pluginDir,"compat-runtime"),path.join(runtime,"compat-runtime"))
  const sdk=path.join(runtime,"node_modules","@opencode-ai","plugin");await fs.mkdir(sdk,{recursive:true});await fs.writeFile(path.join(sdk,"package.json"),JSON.stringify({name:"@opencode-ai/plugin",type:"module",exports:"./index.js"}));await fs.writeFile(path.join(sdk,"index.js"),"export const Plugin={define:(value)=>value}\n")
  await fs.mkdir(path.join(project,".ai"),{recursive:true})
  await fs.writeFile(path.join(project,".ai","control.json"),JSON.stringify({schema_version:3,work_item_id:"V6-TEST",profile:"STANDARD",revision:4,global_status:"PARTIAL",product:{required:false,status:"DRAFT",revision:0},delivery:{required:false,status:"DRAFT",revision:0},engineering:{required:true,status:"VERIFYING",revision:4},evidence:[],evidence_count:0,recent_handoffs:[],notes:[],work_management:{provider:"none",sync_status:"NOT_CONFIGURED",last_sync_at:"",external_refs:[]},traceability:{file:".ai/traceability.json"},audit:{file:".ai/audit.jsonl"}},null,2)+"\n")
  const oldLocal=process.env.LOCALAPPDATA,oldXdg=process.env.XDG_STATE_HOME
  process.env.LOCALAPPDATA=path.join(temp,"localapp");process.env.XDG_STATE_HOME=path.join(temp,"xdg")
  return{temp,runtime,project,pluginDir,restore(){if(oldLocal==null)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=oldLocal;if(oldXdg==null)delete process.env.XDG_STATE_HOME;else process.env.XDG_STATE_HOME=oldXdg}}
}
function makeContext(project,cap,{workerText="worker factual summary",workerRole="assistant",onWait}={}){
  const hooks={},tools=new Map(),commands=new Map(),events=[],synthetics=[],sessions=new Map([["ses_root",{id:"ses_root",location:{directory:project},model:{providerID:"opencode",id:"muse-spark-1.2-contributor-free"},messages:[]}]]),store=new Map();let seq=0,defaultAgent
  const agentRecords=Object.keys(cap.agents).map(id=>({id,description:id})),location={directory:project,project:{id:"v6",directory:project,canonical:project}}
  const ctx={app:{version:"beta-test"},location,
    storage:{async set(k,v){store.set(k,v)},async get(k){return store.get(k)},async remove(k){store.delete(k)},async scan(){return{entries:[]}}},
    agent:{async transform(cb){cb({get(id){return agentRecords.find(x=>x.id===id)},list(){return agentRecords},default(id){defaultAgent=id},update(id,fn){const a=agentRecords.find(x=>x.id===id);if(a)fn(a)},remove(){}})},async list(){return{location,data:agentRecords}}},
    skill:{async list(){return{location,data:[{id:"ai-driven-engineering"}]}}},plugin:{async list(){return{location,data:[{id:"ai-driven-engineering.native"}]}}},
    session:{
      async create(input){const id=`worker-${++seq}`;events.push(["create",id,input]);sessions.set(id,{id,location:{directory:project},messages:[]});return sessions.get(id)},
      async get({sessionID}){return sessions.get(sessionID)||{id:sessionID,location:{directory:project}}},async hook(name,cb){hooks[`session:${name}`]=cb},
      async switchAgent({sessionID,agent}){events.push(["switchAgent",sessionID,agent]);sessions.get(sessionID).agent=agent},async switchModel({sessionID,model}){events.push(["switchModel",sessionID,model]);sessions.get(sessionID).model=model},
      async prompt({sessionID,text,delivery}){events.push(["prompt",sessionID,text,delivery]);const result={info:{role:workerRole},parts:[{type:"text",text:workerText}]};sessions.get(sessionID).messages=[];return result},
      async wait({sessionID}){events.push(["wait",sessionID]);if(onWait)await onWait({sessionID,sessions})},async context({sessionID}){events.push(["context",sessionID]);return sessions.get(sessionID)?.messages||[]},async interrupt({sessionID}){events.push(["interrupt",sessionID])},async synthetic(input){synthetics.push(input)},
    },
    permission:{async hook(name,cb){hooks[`permission:${name}`]=cb}},
    tool:{async transform(cb){cb({add(def){const ns=def.options?.namespace?`${def.options.namespace}_`:"";tools.set(`${ns}${def.name}`,def)},list(){return[...tools.values()]},get(id){return tools.get(id)},update(){},remove(id){tools.delete(id)}})}},
    command:{async transform(cb){cb({add(def){commands.set(def.name,def)}})}},
    vcs:{async get(){return{location,data:{branch:{current:"feature",default:"main"}}}},async status(){return{location,data:[]}},async branches(){return{location,data:[]}},async diff(){return{location,data:[]}}},
    integration:{connection:{async active(){return null},async resolve(){return null}}},
  }
  return{ctx,hooks,tools,commands,events,synthetics,sessions,store,get defaultAgent(){return defaultAgent}}
}
async function setup(fx,opts={}){const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8")),state=makeContext(fx.project,cap,opts),mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?v6=${Date.now()}-${Math.random()}`);await mod.default.setup(state.ctx);return{cap,state}}
const ctx=(agent="orchestrator")=>({sessionID:"ses_root",agent,messageID:"m",id:"c",async progress(){}})
function parse(res){return JSON.parse(res.content)}
async function kernelDir(fx){const real=await fs.realpath(fx.project),normalized=process.platform==="win32"?real.toLowerCase():real,hash=crypto.createHash("sha256").update(normalized).digest("hex"),base=process.platform==="win32"?path.join(process.env.LOCALAPPDATA,"opencode","ade-kernel"):path.join(process.env.XDG_STATE_HOME,"opencode","ade-kernel");return path.join(base,hash)}

test("v6 active surface is kernel-centric and native/legacy delegation is unavailable",async()=>{const fx=await fixture();try{const{cap,state}=await setup(fx);assert.equal(Object.keys(cap.agents).length,5);assert.equal(Object.keys(cap.tools).length,34);assert.deepEqual(new Set(cap.agents.orchestrator),new Set(["ade_status","ade_doctor","ade_workflow_start","ade_workflow_run","ade_workflow_snapshot","ade_workflow_cancel","ade_kernel_reconcile","ade_kernel_events","ade_tracker_project_snapshot"]));const event={sessionID:"ses_root",agent:"orchestrator",model:{},system:[],messages:[],tools:{subagent:{},ade_workflow_start:{},ade_workflow_run:{}},generation:{}};await state.hooks["session:context"](event);assert.equal(event.tools.subagent,undefined);assert.ok(event.tools.ade_workflow_start);assert.ok(event.tools.ade_workflow_run);assert.equal(state.tools.has("ade_delegate"),false,"legacy delegation surface must not be registered")}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})

test("analysis workflow is event-sourced, scheduler-created, synchronous, and completes without worker delegation",async()=>{const fx=await fixture();try{const{state}=await setup(fx);const started=parse(await state.tools.get("ade_workflow_start").execute({objective:"analyze architecture",kind:"analysis",risk:"LOW"},ctx()));const id=started.workflow.id;assert.equal(started.event,"WORKFLOW_STARTED");assert.equal(started.workflow_id,id);assert.equal(started.next_action.tool,"ade_workflow_run");assert.equal(started.next_action.input.workflow_id,id);assert.match(started.note,/no worker session runs|does not run workers/i);assert.equal(started.jobs.length,2);const run=parse(await state.tools.get("ade_workflow_run").execute({workflow_id:id,max_jobs:4},ctx()));assert.equal(run.workflow.status,"DONE");assert.deepEqual(run.jobs.map(x=>x.status),["DONE","DONE"]);assert.deepEqual(state.events.filter(x=>x[0]==="switchAgent").map(x=>x[2]),["explorer","reviewer"]);assert.deepEqual(state.events.filter(x=>x[0]==="prompt").map(x=>x[3]),["steer","steer"]);const order=state.events.map(x=>x[0]);assert.ok(order.indexOf("prompt")<order.indexOf("wait"));assert.ok(order.indexOf("wait")<order.indexOf("context"));const dir=await kernelDir(fx),events=(await fs.readFile(path.join(dir,"events.jsonl"),"utf8")).trim().split(/\r?\n/).map(JSON.parse);assert.ok(events.length>=8);for(let i=0;i<events.length;i++){assert.equal(events[i].seq,i+1);assert.equal(events[i].prev_hash,i?events[i-1].event_hash:"")}const snap=JSON.parse(await fs.readFile(path.join(dir,"snapshot.json"),"utf8"));assert.equal(snap.workflows[id].status,"DONE")}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})

test("worker input is not accepted as a completed worker result",async()=>{const fx=await fixture();try{const{state}=await setup(fx,{workerRole:"user",workerText:"worker capsule echoed before generation"});const started=parse(await state.tools.get("ade_workflow_start").execute({objective:"analyze architecture",kind:"analysis",risk:"LOW"},ctx()));const run=parse(await state.tools.get("ade_workflow_run").execute({workflow_id:started.workflow.id,max_jobs:1},ctx()));assert.equal(run.workflow.status,"RUNNING");assert.equal(run.jobs[0].status,"READY");assert.equal(run.jobs[0].failure_domain,"WORKER_FAILURE");assert.equal(run.executed[0].status,"RETRYABLE");assert.match(run.executed[0].error,/ADE_KERNEL_WORKER_INVALID_OUTPUT/)}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})

test("snapshot is disposable while a tampered journal forces SAFE_READ_ONLY",async()=>{const fx=await fixture();try{const{state}=await setup(fx);const st=parse(await state.tools.get("ade_workflow_start").execute({objective:"read only",kind:"analysis",risk:"LOW"},ctx())),dir=await kernelDir(fx);await fs.writeFile(path.join(dir,"snapshot.json"),JSON.stringify({evil:true}));const snap=parse(await state.tools.get("ade_workflow_snapshot").execute({workflow_id:st.workflow.id},ctx()));assert.equal(snap.workflow.id,st.workflow.id,"snapshot must be rebuilt from journal");const lines=(await fs.readFile(path.join(dir,"events.jsonl"),"utf8")).trim().split(/\r?\n/),ev=JSON.parse(lines[0]);ev.payload={tampered:true};lines[0]=JSON.stringify(ev);await fs.writeFile(path.join(dir,"events.jsonl"),lines.join("\n")+"\n");const safe=parse(await state.tools.get("ade_status").execute({},ctx()));assert.equal(safe.status,"SAFE_READ_ONLY");assert.match(safe.error,/KERNEL_CORRUPT/)}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})

test("engineering workflow refuses to exist without deterministic verification",async()=>{const fx=await fixture();try{const{state}=await setup(fx);const res=parse(await state.tools.get("ade_workflow_start").execute({objective:"change code",kind:"engineering",risk:"MEDIUM"},ctx()));assert.equal(res.status,"BLOCKED");assert.match(res.error,/VERIFICATION_REQUIRED/);const status=parse(await state.tools.get("ade_status").execute({},ctx()));assert.notEqual(status.status,"KERNEL_WORKFLOW")}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})

test("tracker_sync workflow stops at WAITING_APPROVAL with zero remote mutations",async()=>{const fx=await fixture();try{await fs.writeFile(path.join(fx.project,".ai","tracker-policy.json"),JSON.stringify({schema_version:1,read:{authorized:true},write:{authorized:true},remote:{allowed_https_hosts:["api.github.com"],allowed_github_repositories:["octo/repo"],allowed_github_projects:["octo/4"],allowed_jira_projects:[],allowed_linear_team_ids:[]}},null,2));await fs.writeFile(path.join(fx.project,".ai","integrations.json"),JSON.stringify({schema_version:1,work_management:{provider:"github",github:{owner:"octo",repository:"repo",project_owner:"octo",project_number:4,connection_id:"github"}}},null,2));const{state}=await setup(fx);let fetchCalls=0;const orig=globalThis.fetch;globalThis.fetch=async()=>{fetchCalls++;throw new Error("must not fetch before exact grant")};try{const start=parse(await state.tools.get("ade_workflow_start").execute({objective:"set 1 Done",kind:"tracker_sync",risk:"HIGH",tracker_updates:[{external_id:"1",fields:[{name:"Status",value:"Done"}]}]},ctx())),run=parse(await state.tools.get("ade_workflow_run").execute({workflow_id:start.workflow.id,max_jobs:1},ctx()));assert.equal(run.workflow.status,"WAITING_APPROVAL");assert.match(run.executed[0].approval_command,/ade-authorize ade_tracker_project_sync/);assert.equal(fetchCalls,0)}finally{globalThis.fetch=orig}}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})

test("workers cannot access kernel store or create subagents",async()=>{const fx=await fixture();try{const{state}=await setup(fx);await state.tools.get("ade_workflow_start").execute({objective:"x",kind:"analysis",risk:"LOW"},ctx());const dir=await kernelDir(fx),hook=state.hooks["permission:evaluate"];let ev={sessionID:"worker-x",agent:"explorer",action:"read",resources:[path.join(dir,"events.jsonl")],effect:"allow"};await hook(ev);assert.equal(ev.effect,"deny");assert.match(ev.message,/kernel store/);ev={sessionID:"worker-x",agent:"explorer",action:"subagent",resources:["general"],effect:"allow"};await hook(ev);assert.equal(ev.effect,"deny");assert.match(ev.message,/kernel scheduler/)}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})


test("verification resumes from persisted check progress without rerunning worker or consuming prior grant",async()=>{const fx=await fixture();try{
  execFileSync("git",["init","-q"],{cwd:fx.project});execFileSync("git",["config","user.email","ade@test.local"],{cwd:fx.project});execFileSync("git",["config","user.name","ADE Test"],{cwd:fx.project});await fs.writeFile(path.join(fx.project,"baseline.txt"),"baseline\n");execFileSync("git",["add","baseline.txt"],{cwd:fx.project});execFileSync("git",["commit","-q","-m","baseline"],{cwd:fx.project})
  const check=(name)=>({owner:"verifier",non_destructive:true,runner:"process",allow_host_process:true,executable:"node",arguments:["-e","process.exit(0)"],allowed_exit_codes:[0],timeout_ms:15000})
  await fs.writeFile(path.join(fx.project,".ai","execution-policy.json"),JSON.stringify({schema_version:1,authorized:true,checks:{check_one:check("check_one"),check_two:check("check_two")}},null,2)+"\n")
  const{state}=await setup(fx)
  await state.commands.get("ade-authorize").execute({sessionID:"ses_root",prompt:{text:'ade_project_check {"name":"check_one"}'}})
  assert.match(String(state.synthetics.at(-1)?.text||""),/ADE_AUTHORIZE_OK/)
  const start=parse(await state.tools.get("ade_workflow_start").execute({objective:"implement safely",kind:"engineering",risk:"MEDIUM",check_names:["check_one","check_two"]},ctx()))
  const first=parse(await state.tools.get("ade_workflow_run").execute({workflow_id:start.workflow.id,max_jobs:4},ctx()))
  assert.equal(first.workflow.status,"WAITING_APPROVAL")
  const verify1=first.jobs.find(x=>x.type==="VERIFY");assert.equal(verify1.status,"WAITING_APPROVAL");const dir1=await kernelDir(fx),raw1=JSON.parse(await fs.readFile(path.join(dir1,"snapshot.json"),"utf8")),persisted1=raw1.jobs[verify1.id];assert.equal(persisted1.check_results.length,1);assert.equal(persisted1.check_results[0].name,"check_one")
  const verifierSessionsBefore=state.events.filter(x=>x[0]==="switchAgent"&&x[2]==="verifier").length;assert.equal(verifierSessionsBefore,1)
  await state.commands.get("ade-authorize").execute({sessionID:"ses_root",prompt:{text:'ade_project_check {"name":"check_two"}'}})
  assert.match(String(state.synthetics.at(-1)?.text||""),/ADE_AUTHORIZE_OK/)
  const second=parse(await state.tools.get("ade_workflow_run").execute({workflow_id:start.workflow.id,max_jobs:4},ctx()))
  assert.equal(second.workflow.status,"DONE")
  const verify2=second.jobs.find(x=>x.type==="VERIFY");assert.equal(verify2.status,"DONE");const raw2=JSON.parse(await fs.readFile(path.join(dir1,"snapshot.json"),"utf8")),persisted2=raw2.jobs[verify2.id];assert.deepEqual(persisted2.check_results.map(x=>x.name),["check_one","check_two"])
  const verifierSessionsAfter=state.events.filter(x=>x[0]==="switchAgent"&&x[2]==="verifier").length;assert.equal(verifierSessionsAfter,1,"WAITING_APPROVAL resume must not rerun Verifier LLM")
}finally{fx.restore();await fs.rm(fx.temp,{recursive:true,force:true})}})
