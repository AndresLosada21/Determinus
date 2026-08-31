from __future__ import annotations

import os
import re
import json
import tempfile
import time
import shutil
import uuid
from pathlib import Path
from typing import Any

from .common import (
    ADEError, AGENTS, assert_export_info, config_env, export_session, export_tool_records, find_opencode_cli,
    has_assistant_marker, load_jsonc, parse_json_lines, path_get, root_texts, root_tool_events, run_cmd,
)


def runtime_config_smoke(target: Path) -> dict[str, Any]:
    for name in AGENTS:
        p = target / "agents" / f"{name}.md"
        if not p.is_file():
            raise ADEError(f"RUNTIME_INVARIANT_FAILED: agent ausente {p}")
    if not (target / "skills/ai-driven-engineering/SKILL.md").is_file():
        raise ADEError("RUNTIME_INVARIANT_FAILED: skill ausente")
    cfg_path = next((p for p in (target/"opencode.jsonc", target/"opencode.json") if p.is_file()), None)
    if not cfg_path:
        raise ADEError("RUNTIME_INVARIANT_FAILED: config ausente")
    cfg = load_jsonc(cfg_path)
    if "subagent_depth" in cfg:
        raise ADEError("RUNTIME_INVARIANT_FAILED: top-level subagent_depth é legado/unsupported no V2; use experimental.subagent_depth")
    exp = cfg.get("experimental")
    if not isinstance(exp, dict) or int(exp.get("subagent_depth", 0)) != 2:
        raise ADEError(f"RUNTIME_INVARIANT_FAILED: experimental.subagent_depth={exp.get('subagent_depth') if isinstance(exp,dict) else None}")
    if cfg.get("default_agent") != "orchestrator":
        raise ADEError(f"RUNTIME_INVARIANT_FAILED: default_agent={cfg.get('default_agent')}")
    cli = find_opencode_cli()
    if cli:
        r = run_cmd([cli,"debug","config"], env=config_env(target), timeout=45)
        if r.code != 0:
            raise ADEError(f"RUNTIME_CONFIG_FAILED: {r.combined}")
        if "orchestrator" not in r.combined:
            raise ADEError("RUNTIME_CONFIG_FAILED: resolved config não referencia orchestrator")
    print("SUBAGENT_DEPTH_CONFIGURED: experimental.subagent_depth=2")
    print("RUNTIME_CONFIG_VALIDATED")
    return {"cli": cli, "config": cfg}


def _best_effort_cleanup(path: Path) -> None:
    # OpenCode V2 may keep a project/location handle briefly on Windows. Cleanup must
    # never mask the primary validation result.
    for delay in (0.1, 0.25, 0.5, 1.0):
        try:
            shutil.rmtree(path)
            return
        except FileNotFoundError:
            return
        except (PermissionError, OSError):
            time.sleep(delay)
    print(f"SMOKE_SANDBOX_CLEANUP_DEFERRED: {path}")


def _plugin_list_with_startup_retry(cli: str, target: Path):
    """Bounded retry for the short service/plugin discovery race observed after restart.

    This is not a behavioral leniency: success still requires the exact ADE plugin to
    appear in `plugin list`; retries only give the restarted service a bounded window.
    """
    last = None
    for attempt, delay in enumerate((0.0, 0.5, 1.0, 2.0), start=1):
        if delay:
            time.sleep(delay)
        r = run_cmd([cli,"plugin","list"], env=config_env(target), timeout=45)
        last = r
        if r.code == 0 and "ai-driven-engineering" in r.combined.lower():
            if attempt > 1:
                print(f"PLUGIN_LIST_STARTUP_RETRY_RECOVERED: attempt={attempt}")
            return r
    assert last is not None
    if last.code != 0:
        raise ADEError(f"PLUGIN_RUNTIME_BLOCKED: plugin list falhou após retries limitados: {last.combined}")
    raise ADEError("PLUGIN_RUNTIME_BLOCKED: ADE plugin não aparece em plugin list após retries limitados")


def plugin_runtime_smoke(target: Path, model: str | None = None) -> None:
    cli = find_opencode_cli()
    if not cli:
        raise ADEError("PLUGIN_RUNTIME_BLOCKED: OpenCode CLI não encontrado")
    _plugin_list_with_startup_retry(cli, target)
    r = run_cmd([cli,"debug","config"], env=config_env(target), timeout=45)
    if r.code != 0:
        raise ADEError(f"PLUGIN_RUNTIME_BLOCKED: debug config falhou: {r.combined}")
    if sum(1 for x in AGENTS if (target/"agents"/f"{x}.md").is_file()) != 18:
        raise ADEError("PLUGIN_RUNTIME_BLOCKED: agents != 18")
    print("PLUGIN_LOADED_VALIDATED")
    print("AGENT_CAPABILITY_SURFACE_CONFIGURED: 18 agents")
    if not model:
        print("PLUGIN_TOOL_EXECUTION_NOT_PROBED: forneça --model")
        return

    # Baseline: build does not receive ADE typed tools. If this fails, the provider/model
    # path is broken independently of ADE schemas and should not be blamed on the plugin.
    baseline_dir = Path(tempfile.mkdtemp(prefix="ade-v520-provider-baseline-"))
    try:
        baseline = run_cmd([cli,"run","--agent","build","--format","json","--model",model,"Responda apenas PROVIDER_BASELINE_OK sem usar tools."], cwd=baseline_dir, env=config_env(target), timeout=180)
        if baseline.code != 0:
            raise ADEError(f"PROVIDER_BASELINE_FAILED: exit={baseline.code}: {baseline.combined}")
        print("PROVIDER_BASELINE_VALIDATED")
    finally:
        _best_effort_cleanup(baseline_dir)

    catalog_dir = Path(tempfile.mkdtemp(prefix="ade-v520-catalog-"))
    try:
        catalog = run_cmd([cli,"run","--agent","explorer","--format","json","--model",model,"Responda apenas ADE_CATALOG_OK sem usar tools."], cwd=catalog_dir, env=config_env(target), timeout=180)
        if catalog.code != 0:
            msg = catalog.combined
            if "schema validation failed" in msg.lower():
                raise ADEError(f"PLUGIN_CATALOG_SCHEMA_FAILED: provider baseline passou, mas o contexto/catalog ADE foi rejeitado: {msg}")
            raise ADEError(f"PLUGIN_CATALOG_FAILED: exit={catalog.code}: {msg}")
        print("PLUGIN_CATALOG_VALIDATED: explorer context + ADE tool catalog")
    finally:
        _best_effort_cleanup(catalog_dir)

    sandbox = Path(tempfile.mkdtemp(prefix="ade-v520-plugin-smoke-"))
    try:
        (sandbox/".ai").mkdir()
        control = '{"schema_version":3,"work_item_id":"PLUGIN-SMOKE","revision":0,"profile":"LEAN","global_status":"NOT_DONE","product":{"required":false,"status":"DRAFT","revision":0},"delivery":{"required":false,"status":"DRAFT","revision":0},"engineering":{"required":true,"status":"DISCOVERING","revision":0},"evidence":[],"evidence_count":0,"notes":[],"work_management":{"provider":"none","sync_status":"NOT_CONFIGURED","last_sync_at":"","external_refs":[]},"traceability":{"file":".ai/traceability.json"},"audit":{"file":".ai/audit.jsonl"}}\n'
        (sandbox/".ai/control.json").write_text(control, encoding="utf-8")
        nonce = uuid.uuid4().hex
        prompt = f"PLUGIN TOOL SMOKE {nonce}. Execute a tool ade_status exatamente uma vez Não use nenhuma outra tool. Após ade_status completar, responda PLUGIN_TOOL_OK_{nonce}."
        args = [cli,"run","--agent","orchestrator","--format","json","--model",model,prompt]
        rr = run_cmd(args, cwd=sandbox, env=config_env(target), timeout=180)
        if rr.code != 0:
            msg = rr.combined
            if "schema validation failed" in msg.lower():
                raise ADEError(f"PLUGIN_TOOL_SCHEMA_FAILED: catálogo ADE foi admitido, mas a chamada da tool falhou em schema: {msg}")
            raise ADEError(f"PLUGIN_TOOL_EXECUTION_FAILED: exit={rr.code}: {msg}")
        events = parse_json_lines(rr.stdout, "PLUGIN_TOOL_SMOKE")
        ade, other = [], []
        for e in root_tool_events(events):
            tool = str(path_get(e,"part","tool",default=""))
            if tool == "ade_status": ade.append(e)
            elif tool != "skill": other.append(tool)
        if len(ade) != 1:
            raise ADEError(f"PLUGIN_TOOL_EXECUTION_FAILED: ade_status calls={len(ade)} esperado=1")
        if str(path_get(ade[0],"part","state","status",default="")) != "completed":
            raise ADEError("PLUGIN_TOOL_EXECUTION_FAILED: ade_status não completed")
        if other:
            raise ADEError(f"PLUGIN_TOOL_EXECUTION_FAILED: tools extras {other}")
        print("PLUGIN_TOOL_EXECUTION_VALIDATED: orchestrator -> ade_status")
    finally:
        _best_effort_cleanup(sandbox)


def contract_runtime_smoke(target: Path) -> None:
    """Deterministic installed-contract assurance. No LLM behavior is trusted here."""
    cap_path = target / "plugins/ai-driven-engineering/capabilities.json"
    src_path = target / "plugins/ai-driven-engineering/src/index.ts"
    if not cap_path.is_file() or not src_path.is_file():
        raise ADEError("CONTRACT_ASSURANCE_FAILED: plugin source/capabilities ausentes")
    cap = json.loads(cap_path.read_text(encoding="utf-8"))
    tools = cap.get("tools") or {}
    agents = cap.get("agents") or {}
    if len(tools) != 28 or "ade_handoff_submit" not in tools:
        raise ADEError(f"CONTRACT_ASSURANCE_FAILED: typed tools={len(tools)} handoff={'ade_handoff_submit' in tools}")
    if set(agents) != set(AGENTS):
        raise ADEError("CONTRACT_ASSURANCE_FAILED: agent registry divergente")
    for agent in AGENTS:
        text = (target / "agents" / f"{agent}.md").read_text(encoding="utf-8")
        if agent == "orchestrator":
            if "ade_handoff_submit" in agents[agent]:
                raise ADEError("CONTRACT_ASSURANCE_FAILED: orchestrator não deve publicar child handoff")
            if "recent_handoffs" not in text:
                raise ADEError("CONTRACT_ASSURANCE_FAILED: orchestrator não consome structured handoff")
            continue
        if "ade_handoff_submit" not in agents[agent]:
            raise ADEError(f"CONTRACT_ASSURANCE_FAILED: {agent} sem ade_handoff_submit")
        for marker in ("## Handoff canônico", "exatamente um", "no máximo 3 linhas"):
            if marker not in text:
                raise ADEError(f"CONTRACT_ASSURANCE_FAILED: {agent} handoff contract ausente {marker}")
    contract = cap.get("handoff_contract") or {}
    expected = {"max_handoff_bytes":4096,"max_changed_items":8,"max_evidence_refs":8,"recent_in_control":3}
    for key,value in expected.items():
        if int(contract.get(key, -1)) != value:
            raise ADEError(f"CONTRACT_ASSURANCE_FAILED: handoff_contract.{key}={contract.get(key)}")
    src = src_path.read_text(encoding="utf-8")
    for marker in ("HANDOFF_SCHEMA_VIOLATION","HANDOFF_AUTHORITY_VIOLATION","handoffs.jsonl","model.dispatch","provider.retry","approx_context_tokens","ade-cost","ade-handoffs"):
        if marker not in src:
            raise ADEError(f"CONTRACT_ASSURANCE_FAILED: plugin marker ausente {marker}")
    if "prompt_text" in src or "prompt_content" in src:
        raise ADEError("CONTRACT_ASSURANCE_FAILED: telemetry content field detectado")
    print("HANDOFF_CONTRACT_VALIDATED: canonical typed handoffs + bounded schema")
    print("EFFICIENCY_CONTRACT_VALIDATED: dispatch estimates + retry/tool telemetry without prompt payload")
    print("CONTRACT_ASSURANCE_VALIDATED")


def _write_smoke_control(sandbox: Path, work_item: str, *, required_plane: str = "engineering") -> None:
    if required_plane not in {"product","delivery","engineering"}:
        raise ADEError(f"SMOKE_CONTROL_INVALID: required_plane={required_plane}")
    ai=sandbox/".ai"; ai.mkdir(parents=True,exist_ok=True)
    control={
        "schema_version":3,"work_item_id":work_item,"revision":0,"profile":"LEAN","global_status":"NOT_DONE",
        "product":{"required":required_plane=="product","status":"DRAFT","revision":0},
        "delivery":{"required":required_plane=="delivery","status":"DRAFT","revision":0},
        "engineering":{"required":required_plane=="engineering","status":"DISCOVERING" if required_plane=="engineering" else "DRAFT","revision":0},
        "evidence":[],"evidence_count":0,"recent_handoffs":[],"notes":[],
        "work_management":{"provider":"none","sync_status":"NOT_CONFIGURED","last_sync_at":"","external_refs":[]},
        "traceability":{"file":".ai/traceability.json"},"audit":{"file":".ai/audit.jsonl"}
    }
    (ai/"control.json").write_text(json.dumps(control,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


def _records_for(export: dict, agent: str) -> list[tuple[dict,dict]]:
    out=[]
    for msg,entry in export_tool_records(export):
        if msg.get("type") != "assistant" or msg.get("agent") != agent:
            raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: tool record não pertence a assistant/{agent}")
        out.append((msg,entry))
    return out


def _child_from_subagent(entry: dict, expected: str) -> str:
    status=str(path_get(entry,"state","status",default=""))
    if status != "completed": raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: subagent status={status}")
    actual=str(path_get(entry,"state","input","agent",default=""))
    if actual != expected: raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: subagent esperado={expected} atual={actual}")
    child=str(path_get(entry,"state","metadata","sessionID",default=""))
    if not child: child=str(path_get(entry,"state","metadata","metadata","sessionID",default=""))
    if not child: raise ADEError("BEHAVIORAL_CONTRACT_FAILED: child sessionID ausente")
    return child


def _handoff_input(entry: dict) -> dict:
    status=str(path_get(entry,"state","status",default=""))
    if status != "completed": raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: handoff tool status={status}")
    value=path_get(entry,"state","input",default={})
    if not isinstance(value,dict): raise ADEError("BEHAVIORAL_CONTRACT_FAILED: handoff input inválido")
    return value


def _assert_one_handoff(export: dict, agent: str, *, status: str, required_owner: str, next_contains: str | None = None) -> dict:
    handoffs=[]; extras=[]
    for _,entry in _records_for(export,agent):
        tool=str(entry.get("name",""))
        if tool=="ade_handoff_submit": handoffs.append(_handoff_input(entry))
        elif tool=="skill": extras.append("skill")
        elif tool=="subagent": extras.append("subagent")
        else: extras.append(tool)
    if len(handoffs)!=1: raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: {agent} handoff calls={len(handoffs)} esperado=1")
    h=handoffs[0]
    if str(h.get("status"))!=status: raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: {agent} handoff status={h.get('status')} esperado={status}")
    if str(h.get("required_owner") or "none")!=required_owner: raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: {agent} owner={h.get('required_owner')} esperado={required_owner}")
    if next_contains and next_contains.lower() not in str(h.get("next") or "").lower(): raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: {agent} next não contém {next_contains}")
    if extras: raise ADEError(f"BEHAVIORAL_CONTRACT_FAILED: {agent} tools extras {extras}")
    return h


def _assistant_text_size(export: dict, agent: str) -> int:
    total=0
    for msg in export.get("messages") or []:
        if not isinstance(msg,dict) or msg.get("type")!="assistant" or msg.get("agent")!=agent: continue
        for entry in msg.get("content") or []:
            if isinstance(entry,dict) and entry.get("type")=="text" and isinstance(entry.get("text"),str): total+=len(entry["text"])
    return total


def nested_delegation_smoke(target: Path, model: str) -> None:
    cli=find_opencode_cli()
    if not cli: raise ADEError("NESTED_DELEGATION_FAILED: OpenCode CLI não encontrado")
    nonce=uuid.uuid4().hex
    sandbox=Path(tempfile.mkdtemp(prefix="ade-v525-nested-")); _write_smoke_control(sandbox,f"NESTED-{nonce[:8]}",required_plane="delivery")
    prompt=f"""NESTED STRUCTURED HANDOFF CANARY {nonce}.
Você é Orchestrator. Invoque EXATAMENTE project-manager com este envelope no início do brief:
ADE_DELEGATION_CONTEXT: COMPLETE
objective: provar delegação Delivery mínima
authoritative_inputs: Delivery é o owner requerido neste fixture
required_action: DELEGATE_ONCE
required_child: tracker-operator
DISCOVERY_ALLOWED: false
return_contract: publicar exatamente um ade_handoff_submit e responder em até 3 linhas
Project Manager deve invocar EXATAMENTE tracker-operator com `ADE_DELEGATION_CONTEXT: COMPLETE`, `REQUIRED_ACTION: HANDOFF_ONLY`, `DISCOVERY_ALLOWED: false` e return contract explícito.
Tracker Operator não deve ler/escrever nada nem chamar outras tools; deve publicar exatamente um ade_handoff_submit com status=DONE, changed=[\"nested level2 completed\"], required_owner=project-manager, next contendo \"project-manager\", e finalizar em no máximo 3 linhas.
Project Manager, após o child concluir, deve publicar exatamente um ade_handoff_submit com status=DONE, changed=[\"nested level1 completed\"], required_owner=orchestrator, next contendo \"orchestrator\", e finalizar em no máximo 3 linhas.
Como o routing é STATE_DRIVEN, Orchestrator pode chamar ade_status e ade_route_snapshot no máximo uma vez cada antes da delegação. Não chame nenhuma outra ADE tool nem outro subagent. Finalize concisamente após o PM concluir.
"""
    try:
        rr=run_cmd([cli,"run","--agent","orchestrator","--format","json","--model",model,prompt],cwd=sandbox,env=config_env(target),timeout=300)
        if rr.code!=0: raise ADEError(f"NESTED_DELEGATION_FAILED: root exit={rr.code}: {rr.combined}")
        events=parse_json_lines(rr.stdout,"NESTED_ROOT")
        sub=[]; extras=[]; control_calls={"ade_status":0,"ade_route_snapshot":0}
        for e in root_tool_events(events):
            tool=str(path_get(e,"part","tool",default=""))
            status=str(path_get(e,"part","state","status",default=""))
            if tool=="subagent":
                if status!="completed": extras.append(f"subagent:{status}")
                else: sub.append(e)
            elif tool=="skill":
                extras.append("skill")
            elif tool in control_calls:
                control_calls[tool]+=1
                if status!="completed": extras.append(f"{tool}:{status}")
            else: extras.append(tool)
        repeated=[name for name,count in control_calls.items() if count>1]
        if len(sub)!=1 or extras or repeated:
            raise ADEError(f"NESTED_DELEGATION_FAILED: root subagents={len(sub)} extras={extras} repeated_control={repeated}")
        root_id=str(sub[0].get("sessionID",""))
        # root event shape wraps state under part; extract child session explicitly
        pm_id=str(path_get(sub[0],"part","state","metadata","sessionID",default="")) or str(path_get(sub[0],"part","state","metadata","metadata","sessionID",default=""))
        if not root_id or not pm_id: raise ADEError("NESTED_DELEGATION_FAILED: root/PM sessionID ausente")
        pm=export_session(cli,pm_id,target); assert_export_info(pm,session_id=pm_id,parent_id=root_id,agent="project-manager",label="PM")
        pm_records=_records_for(pm,"project-manager"); pm_sub=[entry for _,entry in pm_records if str(entry.get("name",""))=="subagent"]
        pm_h=[entry for _,entry in pm_records if str(entry.get("name",""))=="ade_handoff_submit"]
        pm_extra=[str(entry.get("name","")) for _,entry in pm_records if str(entry.get("name","")) not in {"subagent","ade_handoff_submit"}]
        if len(pm_sub)!=1 or len(pm_h)!=1 or pm_extra: raise ADEError(f"NESTED_DELEGATION_FAILED: PM sub={len(pm_sub)} handoff={len(pm_h)} extras={pm_extra}")
        tracker_id=_child_from_subagent(pm_sub[0],"tracker-operator")
        h1=_handoff_input(pm_h[0]);
        if h1.get("status")!="DONE" or h1.get("required_owner")!="orchestrator" or "orchestrator" not in str(h1.get("next") or "").lower(): raise ADEError(f"NESTED_DELEGATION_FAILED: PM handoff inválido {h1}")
        tracker=export_session(cli,tracker_id,target); assert_export_info(tracker,session_id=tracker_id,parent_id=pm_id,agent="tracker-operator",label="Tracker")
        _assert_one_handoff(tracker,"tracker-operator",status="DONE",required_owner="project-manager",next_contains="project-manager")
        if _assistant_text_size(pm,"project-manager")>1200 or _assistant_text_size(tracker,"tracker-operator")>800: raise ADEError("NESTED_DELEGATION_FAILED: child response verbosity excedida")
        print("NESTED_DELEGATION_OK")
        print("STRUCTURED_HANDOFF_BEHAVIOR_VALIDATED: orchestrator -> project-manager -> tracker-operator")
    finally:_best_effort_cleanup(sandbox)


def capability_recovery_smoke(target: Path, model: str) -> None:
    cli=find_opencode_cli()
    if not cli: raise ADEError("CAPABILITY_RECOVERY_FAILED: OpenCode CLI não encontrado")
    scenarios=[
      ("explorer","explorer-cross-plane","Permission denied: shell para gh issue view 95; tracker evidence continua necessária.","project-manager","tracker-operator"),
      ("implementer","implementer-to-verifier","Implementação criada; Permission denied: shell para php -l; sintaxe independente continua necessária.","engineer","verifier"),
    ]
    for agent,name,evidence,owner,next_owner in scenarios:
        sandbox=Path(tempfile.mkdtemp(prefix=f"ade-v525-cap-{name}-"));_write_smoke_control(sandbox,f"CAP-{name}")
        prompt=f"""STRUCTURED CAPABILITY RECOVERY CANARY.
ADE_DELEGATION_CONTEXT: COMPLETE
objective: classificar somente a evidência de capability já observada
authoritative_inputs: {evidence}
REQUIRED_ACTION: HANDOFF_ONLY
DISCOVERY_ALLOWED: false
return_contract: use como única ADE tool `ade_handoff_submit` exatamente uma vez, com status=BLOCKED, blocker curto explicando a evidência faltante, required_owner={owner}, next contendo {next_owner}; finalize em no máximo 3 linhas.
Não execute novamente a ação negada, não devolva comando manual e não generalize indisponibilidade global.
"""
        try:
            rr=run_cmd([cli,"run","--agent",agent,"--format","json","--model",model,prompt],cwd=sandbox,env=config_env(target),timeout=180)
            if rr.code!=0: raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: exit={rr.code}: {rr.combined}")
            events=parse_json_lines(rr.stdout,f"CAPABILITY[{name}]")
            tools=[]
            for e in root_tool_events(events): tools.append((str(path_get(e,"part","tool",default="")),e))
            if len(tools)!=1 or tools[0][0]!="ade_handoff_submit": raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: tools={ [x[0] for x in tools] }")
            h=path_get(tools[0][1],"part","state","input",default={})
            if h.get("status")!="BLOCKED" or h.get("required_owner")!=owner or next_owner.lower() not in str(h.get("next") or "").lower() or not str(h.get("blocker") or "").strip(): raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: handoff={h}")
            text="\n".join(root_texts(events))
            if len(text)>1000: raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: resposta verbosa chars={len(text)}")
            if re.search(r"(?i)all tools unavailable|todas as tools.*indispon|shell.*indisponível",text): raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: generalização global")
            print(f"CAPABILITY_RECOVERY_SCENARIO_OK: {name}")
        finally:_best_effort_cleanup(sandbox)
    print("CAPABILITY_RECOVERY_VALIDATED: structured deny recovery")


def engineering_recovery_routing_smoke(target: Path, model: str) -> None:
    cli=find_opencode_cli()
    if not cli: raise ADEError("ENGINEERING_RECOVERY_ROUTING_FAILED: OpenCode CLI não encontrado")
    nonce=uuid.uuid4().hex
    sandbox=Path(tempfile.mkdtemp(prefix="ade-v525-eng-recovery-"));_write_smoke_control(sandbox,f"ENG-{nonce[:8]}")
    prompt=f"""ENGINEERING STRUCTURED RECOVERY CANARY {nonce}.
Você é Engineer. Um Implementer informou BLOCKED porque validação independente é necessária.
ADE_DELEGATION_CONTEXT: COMPLETE
objective: rotear validação independente já classificada
authoritative_inputs: Implementer exige Verifier; nenhuma validação real deve rodar neste canary
required_action: DELEGATE_ONCE
required_child: verifier
DISCOVERY_ALLOWED: false
return_contract: handoff PARTIAL após consumir o child
Invoque EXATAMENTE verifier. No brief do Verifier inclua `ADE_DELEGATION_CONTEXT: COMPLETE`, `REQUIRED_ACTION: HANDOFF_ONLY`, `DISCOVERY_ALLOWED: false`; ele deve usar somente ade_handoff_submit exatamente uma vez com status=DONE, changed=[\"verification evidence classified\"], required_owner=engineer, next contendo \"engineer\".
Após o Verifier concluir, publique você exatamente um ade_handoff_submit com status=PARTIAL, changed=[\"verifier handoff consumed\"], required_owner=none, next contendo \"continue engineering\". Finalize em no máximo 3 linhas.
"""
    try:
        rr=run_cmd([cli,"run","--agent","engineer","--format","json","--model",model,prompt],cwd=sandbox,env=config_env(target),timeout=240)
        if rr.code!=0: raise ADEError(f"ENGINEERING_RECOVERY_ROUTING_FAILED: exit={rr.code}: {rr.combined}")
        events=parse_json_lines(rr.stdout,"ENGINEERING_RECOVERY")
        sub=[];handoffs=[];extras=[]
        for e in root_tool_events(events):
            tool=str(path_get(e,"part","tool",default=""))
            if tool=="subagent":sub.append(e)
            elif tool=="ade_handoff_submit":handoffs.append(e)
            elif tool=="skill":extras.append("skill")
            else:extras.append(tool)
        if len(sub)!=1 or len(handoffs)!=1 or extras: raise ADEError(f"ENGINEERING_RECOVERY_ROUTING_FAILED: sub={len(sub)} handoff={len(handoffs)} extras={extras}")
        verifier_id=str(path_get(sub[0],"part","state","metadata","sessionID",default="")) or str(path_get(sub[0],"part","state","metadata","metadata","sessionID",default=""))
        root_id=str(sub[0].get("sessionID",""))
        if str(path_get(sub[0],"part","state","input","agent",default=""))!="verifier" or not verifier_id: raise ADEError("ENGINEERING_RECOVERY_ROUTING_FAILED: verifier delegation inválida")
        eh=path_get(handoffs[0],"part","state","input",default={})
        if eh.get("status")!="PARTIAL" or str(eh.get("required_owner") or "none")!="none" or "continue engineering" not in str(eh.get("next") or "").lower(): raise ADEError(f"ENGINEERING_RECOVERY_ROUTING_FAILED: engineer handoff={eh}")
        exp=export_session(cli,verifier_id,target);assert_export_info(exp,session_id=verifier_id,parent_id=root_id,agent="verifier",label="Verifier")
        _assert_one_handoff(exp,"verifier",status="DONE",required_owner="engineer",next_contains="engineer")
        if len("\n".join(root_texts(events)))>1200 or _assistant_text_size(exp,"verifier")>800: raise ADEError("ENGINEERING_RECOVERY_ROUTING_FAILED: verbosity budget excedido")
        print("ENGINEERING_RECOVERY_ROUTING_OK")
        print("ENGINEERING_RECOVERY_ROUTING_VALIDATED: engineer -> verifier + canonical handoffs")
    finally:_best_effort_cleanup(sandbox)

def behavioral_reliability_report(target: Path, model: str, *, trials: int = 5, strict: bool = False) -> dict[str, Any]:
    """Run repeated *strict* behavioral trials without weakening any individual assertion.

    Reliability is reported statistically because model/provider execution is stochastic.
    `strict=True` fails unless every trial of every scenario passes. No failed semantic
    trial is silently retried or converted to success.
    """
    if trials < 1 or trials > 20:
        raise ADEError(f"BEHAVIORAL_RELIABILITY_INVALID_TRIALS: {trials}; esperado 1..20")
    scenarios=[
        ("nested-delegation", nested_delegation_smoke),
        ("capability-recovery", capability_recovery_smoke),
        ("engineering-recovery", engineering_recovery_routing_smoke),
    ]
    summary: dict[str, Any]={"model":model,"trials":trials,"scenarios":{},"total_pass":0,"total_fail":0}
    for name,fn in scenarios:
        passes=0; failures=[]
        for idx in range(1,trials+1):
            try:
                fn(target,model)
                passes+=1
                print(f"BEHAVIORAL_TRIAL: scenario={name} trial={idx}/{trials} result=PASS")
            except ADEError as exc:
                failures.append(str(exc))
                print(f"BEHAVIORAL_TRIAL: scenario={name} trial={idx}/{trials} result=FAIL reason={exc}")
        fails=trials-passes
        summary["scenarios"][name]={"passed":passes,"failed":fails,"pass_rate":passes/trials,"failures":failures}
        summary["total_pass"]+=passes; summary["total_fail"]+=fails
        print(f"BEHAVIORAL_RELIABILITY: scenario={name} passed={passes}/{trials} pass_rate={passes/trials:.0%}")
    total=trials*len(scenarios); summary["pass_rate"]=summary["total_pass"]/total
    print(f"BEHAVIORAL_RELIABILITY_SUMMARY: model={model} passed={summary['total_pass']}/{total} pass_rate={summary['pass_rate']:.0%}")
    if strict and summary["total_fail"]:
        raise ADEError(f"BEHAVIORAL_RELIABILITY_FAILED: failures={summary['total_fail']}/{total}; veja os trials acima")
    return summary

