import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"

async function fixture(){
  const pluginDir=path.resolve(fileURLToPath(new URL("..", import.meta.url)))
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"ade-provider-compat-"))
  const runtime=path.join(temp,"plugin")
  await fs.mkdir(path.join(runtime,"src"),{recursive:true})
  await fs.copyFile(path.join(pluginDir,"src","index.ts"),path.join(runtime,"src","index.ts"))
  await fs.copyFile(path.join(pluginDir,"capabilities.json"),path.join(runtime,"capabilities.json"))
  await fs.cp(path.join(pluginDir,"assets"),path.join(runtime,"assets"),{recursive:true})
  await fs.cp(path.join(pluginDir,"compat-runtime"),path.join(runtime,"compat-runtime"),{recursive:true})
  const sdk=path.join(runtime,"node_modules","@opencode-ai","plugin")
  await fs.mkdir(sdk,{recursive:true})
  await fs.writeFile(path.join(sdk,"package.json"),JSON.stringify({name:"@opencode-ai/plugin",type:"module",exports:"./index.js"}))
  await fs.writeFile(path.join(sdk,"index.js"),"export const Plugin={define:(value)=>value}\n")
  const project=path.join(temp,"project")
  await fs.mkdir(project,{recursive:true})
  return {temp,runtime,project}
}

function makeContext(project,cap){
  const hooks={},tools=new Map(),commands=new Map()
  const agents=Object.keys(cap.agents).map(id=>({id,description:id}))
  const location={directory:project,project:{id:"test",directory:project,canonical:project}}
  const ctx={
    app:{version:"0.0.0-beta-test"},location,
    storage:{async set(){},async get(){},async remove(){},async scan(){return{entries:[]}}},
    agent:{async transform(cb){const draft={get(id){return agents.find(a=>a.id===id)},list(){return agents},default(){},update(id,fn){const a=agents.find(x=>x.id===id);if(a)fn(a)},remove(){}};cb(draft)},async list(){return{location,data:agents}}},
    skill:{async list(){return{location,data:[{id:"ai-driven-engineering"}]}}},
    plugin:{async list(){return{location,data:[{id:"ai-driven-engineering.native"}]}}},
    session:{async get({sessionID}){return{id:sessionID,location:{directory:project}}},async hook(name,cb){hooks[`session:${name}`]=cb},async synthetic(){},async prompt(){},async switchAgent(){},async context(){return[]}},
    permission:{async hook(name,cb){hooks[`permission:${name}`]=cb}},
    tool:{async transform(cb){cb({add(def){const ns=def.options?.namespace?`${def.options.namespace}_`:"";tools.set(`${ns}${def.name}`,def)},list(){return[...tools.values()]},get(id){return tools.get(id)},update(){},remove(){}})}},
    command:{async transform(cb){cb({add(def){commands.set(def.name,def)}})}},
    vcs:{async get(){return{location,data:{branch:{current:"feature",default:"main"}}}},async status(){return{location,data:[]}},async branches(){return{location,data:[]}},async diff(){return{location,data:[]}}},
    integration:{connection:{async active(id){return{id,type:"test"}},async resolve(){return{token:"test-token"}}}},
  }
  return {ctx,hooks,tools,commands}
}

async function setup(){
  const fx=await fixture()
  const cap=JSON.parse(await fs.readFile(path.join(fx.runtime,"capabilities.json"),"utf8"))
  const state=makeContext(fx.project,cap)
  const mod=await import(`${pathToFileURL(path.join(fx.runtime,"src","index.ts")).href}?provider=${Date.now()}-${Math.random()}`)
  await mod.default.setup(state.ctx)
  const hook=state.hooks["session:http.request"]
  assert.equal(typeof hook,"function","http.request compatibility hook must be registered")
  return {fx,state,hook}
}

function req(body,url="https://opencode.ai/zen/v1/chat/completions"){
  return new Request(url,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer test-secret","x-keep":"yes"},body:JSON.stringify(body)})
}

async function bodyOf(request){return JSON.parse(await request.clone().text())}

test("Zen auto-only required tool_choice is normalized to auto",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s1",agent:"project-manager",model:{providerID:"opencode",id:"muse-spark-1.2-contributor-free"},request:req({model:"muse-spark-1.2-contributor-free",tool_choice:"required",tools:[{type:"function",function:{name:"ade_status"}}]},"https://opencode.ai/zen/v1/responses")}
    await hook(event)
    const body=await bodyOf(event.request)
    assert.equal(body.tool_choice,"auto")
    assert.equal(body.tools.length,1)
    assert.equal(event.request.headers.get("authorization"),"Bearer test-secret")
    assert.equal(event.request.headers.get("x-keep"),"yes")
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})

test("Zen auto-only named tool_choice is normalized to auto",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s2",agent:"engineer",model:{providerID:"opencode",id:"mimo-v2.5-free"},request:req({model:"mimo-v2.5-free",tool_choice:{type:"function",function:{name:"ade_handoff_submit"}},tools:[{type:"function",function:{name:"ade_handoff_submit"}}]})}
    await hook(event)
    assert.equal((await bodyOf(event.request)).tool_choice,"auto")
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})

test("Zen auto-only none preserves no-tools semantics",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s3",agent:"engineer",model:{providerID:"opencode",id:"nemotron-3-ultra-free"},request:req({model:"nemotron-3-ultra-free",tool_choice:"none",tools:[{type:"function",function:{name:"danger"}}]})}
    await hook(event)
    const body=await bodyOf(event.request)
    assert.equal(Object.hasOwn(body,"tool_choice"),false)
    assert.equal(Object.hasOwn(body,"toolChoice"),false)
    assert.equal(Object.hasOwn(body,"tools"),false)
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})

test("unknown provider/model request is never rewritten",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s4",agent:"project-manager",model:{providerID:"anthropic",id:"claude-sonnet-4-6"},request:req({model:"claude-sonnet-4-6",tool_choice:"required",tools:[{type:"function",function:{name:"ade_status"}}]},"https://api.anthropic.com/v1/messages")}
    await hook(event)
    assert.equal((await bodyOf(event.request)).tool_choice,"required")
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})

test("invalid JSON provider body is left untouched and does not fail",async()=>{
  const {fx,hook}=await setup()
  try{
    const request=new Request("https://opencode.ai/zen/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json"},body:"{not-json"})
    const event={sessionID:"s5",agent:"project-manager",model:{providerID:"opencode",id:"muse-spark-1.2-contributor-free"},request}
    await hook(event)
    assert.equal(await event.request.clone().text(),"{not-json")
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})


test("Zen host plus known model is sufficient when providerID is absent",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s6",agent:"project-manager",model:{id:"muse-spark-1.2-contributor-free"},request:req({model:"muse-spark-1.2-contributor-free",toolChoice:"required",tools:[{type:"function",function:{name:"ade_status"}}]},"https://opencode.ai/zen/v1/responses")}
    await hook(event)
    const body=await bodyOf(event.request)
    assert.equal(body.tool_choice,"auto")
    assert.equal(Object.hasOwn(body,"toolChoice"),false)
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})

test("ChatGPT Codex Responses omits incompatible max_output_tokens but preserves the request",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s7",agent:"orchestrator",model:{providerID:"openai",id:"gpt-5.6-terra"},request:req({model:"gpt-5.6-terra",max_output_tokens:1200,reasoning:{effort:"high"},tools:[{type:"function",name:"ade_status",parameters:{type:"object"}}]},"https://chatgpt.com/backend-api/codex/responses")}
    await hook(event)
    const body=await bodyOf(event.request)
    assert.equal(Object.hasOwn(body,"max_output_tokens"),false)
    assert.deepEqual(body.reasoning,{effort:"high"})
    assert.equal(body.tools.length,1)
    assert.equal(event.request.headers.get("authorization"),"Bearer test-secret")
    assert.equal(event.request.headers.get("x-keep"),"yes")
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})

test("public OpenAI API keeps max_output_tokens budget intact",async()=>{
  const {fx,hook}=await setup()
  try{
    const event={sessionID:"s8",agent:"orchestrator",model:{providerID:"openai",id:"gpt-5.6-terra"},request:req({model:"gpt-5.6-terra",max_output_tokens:1200,tools:[]},"https://api.openai.com/v1/responses")}
    const before=await event.request.clone().text()
    await hook(event)
    assert.equal(await event.request.clone().text(),before)
    assert.equal((await bodyOf(event.request)).max_output_tokens,1200)
  }finally{await fs.rm(fx.temp,{recursive:true,force:true})}
})
