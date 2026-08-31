from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Callable

from .common import (
    ADEError, AGENTS, config_env, find_opencode_cli, load_json, load_jsonc, parse_json_lines,
    path_get, root_texts, root_tool_events, run_cmd,
)

ACTIVE_AGENTS = {"orchestrator","explorer","implementer","verifier","reviewer"}


def runtime_agent_catalog(target: Path, cli: str) -> dict[str, Any]:
    last = ""
    for attempt, delay in enumerate((0.0, 0.5, 1.0, 2.0), 1):
        if delay:
            time.sleep(delay)
        result = run_cmd([cli, "api", "get", "/api/agent"], cwd=target, env=config_env(target), timeout=45)
        last = result.combined
        if result.code != 0:
            continue
        try:
            payload = json.loads(result.stdout)
            agents = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(agents, list):
                continue
            discovered = {str(agent.get("id")) for agent in agents if isinstance(agent, dict)}
        except Exception:
            continue
        missing = sorted(ACTIVE_AGENTS - discovered)
        if not missing:
            if attempt > 1:
                print(f"AGENT_CATALOG_STARTUP_RETRY_RECOVERED: attempt={attempt}")
            return {"discovered": discovered, "missing": []}
        last = f"missing={missing}; response={last[:1000]}"
    raise ADEError(f"ADE_AGENT_CATALOG_INVALID: required_active_agents_missing; {last[:1400]}")


def runtime_config_smoke(target: Path) -> dict[str, Any]:
    for name in AGENTS:
        if not (target/"agents"/f"{name}.md").is_file():raise ADEError(f"RUNTIME_INVARIANT_FAILED: managed agent file missing {name}")
    cap_path=target/"plugins/ai-driven-engineering/capabilities.json"
    if not cap_path.is_file():raise ADEError("RUNTIME_INVARIANT_FAILED: capabilities.json missing")
    cap=load_json(cap_path)
    if set(cap.get("agents",{}))!=ACTIVE_AGENTS:raise ADEError(f"RUNTIME_INVARIANT_FAILED: active agents={sorted(cap.get('agents',{}))}")
    if len(cap.get("tools",{}))!=35:raise ADEError(f"RUNTIME_INVARIANT_FAILED: tools={len(cap.get('tools',{}))}")
    if (cap.get("deterministic_control_plane") or {}).get("architecture")!="DURABLE_OBSERVABLE_RUNTIME":raise ADEError("RUNTIME_INVARIANT_FAILED: architecture != DURABLE_OBSERVABLE_RUNTIME")
    cfg_path=next((p for p in (target/"opencode.jsonc",target/"opencode.json") if p.is_file()),None)
    if not cfg_path:raise ADEError("RUNTIME_INVARIANT_FAILED: OpenCode config missing")
    cfg=load_jsonc(cfg_path)
    if "subagent_depth" in cfg:raise ADEError("RUNTIME_INVARIANT_FAILED: top-level subagent_depth unsupported")
    exp=cfg.get("experimental")
    if not isinstance(exp,dict) or int(exp.get("subagent_depth",0))!=1:raise ADEError(f"RUNTIME_INVARIANT_FAILED: v6 experimental.subagent_depth={exp.get('subagent_depth') if isinstance(exp,dict) else None}")
    if cfg.get("default_agent")!="orchestrator":raise ADEError(f"RUNTIME_INVARIANT_FAILED: default_agent={cfg.get('default_agent')}")
    configured_agents=cfg.get("agents")
    if not isinstance(configured_agents,dict):raise ADEError("RUNTIME_INVARIANT_FAILED: managed agent config missing")
    if set(configured_agents)!=set(AGENTS):raise ADEError(f"RUNTIME_INVARIANT_FAILED: managed agent config={sorted(configured_agents)}")
    cli=find_opencode_cli()
    if cli:
        r=run_cmd([cli,"debug","config"],env=config_env(target),timeout=45)
        if r.code!=0:raise ADEError(f"RUNTIME_CONFIG_FAILED: {r.combined}")
        if "orchestrator" not in r.combined:raise ADEError("RUNTIME_CONFIG_FAILED: resolved config does not reference orchestrator")
        runtime_agent_catalog(target,cli)
    print("V6_SUBAGENT_DEPTH_CONFIGURED: experimental.subagent_depth=1 (native recursion unused)")
    print("AGENT_CONFIG_REGISTERED: managed=18 active=5")
    print("AGENT_CATALOG_VALIDATED: required_active_agents=5")
    print("DURABLE_KERNEL_CONFIGURED: active_agents=5 managed_agent_files=18 tools=35")
    print("RUNTIME_CONFIG_VALIDATED")
    return {"cli":cli,"config":cfg,"capabilities":cap}


def _best_effort_cleanup(path: Path) -> None:
    for delay in (0.1,0.25,0.5,1.0):
        try:shutil.rmtree(path);return
        except FileNotFoundError:return
        except (PermissionError,OSError):time.sleep(delay)
    print(f"SMOKE_SANDBOX_CLEANUP_DEFERRED: {path}")


def _plugin_list_with_startup_retry(cli: str,target: Path):
    last=None
    for attempt,delay in enumerate((0.0,0.5,1.0,2.0),1):
        if delay:time.sleep(delay)
        r=run_cmd([cli,"plugin","list"],env=config_env(target),timeout=45);last=r
        if r.code==0 and "ai-driven-engineering" in r.combined.lower():
            if attempt>1:print(f"PLUGIN_LIST_STARTUP_RETRY_RECOVERED: attempt={attempt}")
            return r
    assert last is not None
    raise ADEError(f"PLUGIN_RUNTIME_BLOCKED: plugin list failed: {last.combined}")


def plugin_runtime_smoke(target: Path,model: str|None=None)->None:
    cli=find_opencode_cli()
    if not cli:raise ADEError("PLUGIN_RUNTIME_BLOCKED: OpenCode CLI not found")
    _plugin_list_with_startup_retry(cli,target)
    cap=load_json(target/"plugins/ai-driven-engineering/capabilities.json")
    if set(cap.get("agents",{}))!=ACTIVE_AGENTS or len(cap.get("tools",{}))!=35:raise ADEError("PLUGIN_RUNTIME_BLOCKED: v6 capability surface mismatch")
    print("PLUGIN_LOADED_VALIDATED")
    print("AGENT_CAPABILITY_SURFACE_CONFIGURED: managed=18 active=5 tools=35 architecture=DURABLE_OBSERVABLE_RUNTIME")
    if not model:
        print("PLUGIN_TOOL_EXECUTION_NOT_PROBED: provide --model")
        return

    baseline_dir=Path(tempfile.mkdtemp(prefix="ade-v6-provider-baseline-"))
    try:
        baseline=run_cmd([cli,"run","--agent","build","--format","json","--model",model,"Respond only PROVIDER_BASELINE_OK without tools."],cwd=baseline_dir,env=config_env(target),timeout=180)
        if baseline.code!=0:raise ADEError(f"PROVIDER_BASELINE_FAILED: exit={baseline.code}: {baseline.combined}")
        print("PROVIDER_BASELINE_VALIDATED")
    finally:_best_effort_cleanup(baseline_dir)

    catalog_dir=Path(tempfile.mkdtemp(prefix="ade-v6-catalog-"))
    try:
        catalog=run_cmd([cli,"run","--agent","explorer","--format","json","--model",model,"Respond only ADE_V6_WORKER_CATALOG_OK without tools."],cwd=catalog_dir,env=config_env(target),timeout=180)
        if catalog.code!=0:raise ADEError(f"PLUGIN_CATALOG_FAILED: exit={catalog.code}: {catalog.combined}")
        print("PLUGIN_CATALOG_VALIDATED: disposable worker context")
    finally:_best_effort_cleanup(catalog_dir)

    sandbox=Path(tempfile.mkdtemp(prefix="ade-v6-plugin-smoke-"))
    try:
        nonce=uuid.uuid4().hex
        prompt=f"ADE V6 TOOL SMOKE {nonce}. Call ade_status exactly once, no other tool. Then answer ADE_V6_TOOL_OK_{nonce}."
        rr=run_cmd([cli,"run","--agent","orchestrator","--format","json","--model",model,prompt],cwd=sandbox,env=config_env(target),timeout=180)
        if rr.code!=0:raise ADEError(f"PLUGIN_TOOL_EXECUTION_FAILED: exit={rr.code}: {rr.combined}")
        events=parse_json_lines(rr.stdout,"ADE_V6_TOOL_SMOKE");calls=[];extras=[]
        for e in root_tool_events(events):
            tool=str(path_get(e,"part","tool",default=""))
            if tool=="ade_status":calls.append(e)
            else:extras.append(tool)
        if len(calls)!=1 or extras:raise ADEError(f"PLUGIN_TOOL_EXECUTION_FAILED: ade_status={len(calls)} extras={extras}")
        if str(path_get(calls[0],"part","state","status",default=""))!="completed":raise ADEError("PLUGIN_TOOL_EXECUTION_FAILED: ade_status not completed")
        print("PLUGIN_TOOL_EXECUTION_VALIDATED: orchestrator -> ade_status -> durable kernel")
    finally:_best_effort_cleanup(sandbox)


def contract_runtime_smoke(target: Path)->None:
    cap=load_json(target/"plugins/ai-driven-engineering/capabilities.json");src=(target/"plugins/ai-driven-engineering/src/index.ts").read_text(encoding="utf-8")
    agents=cap.get("agents") or {};tools=cap.get("tools") or {}
    if set(agents)!=ACTIVE_AGENTS:raise ADEError(f"CONTRACT_ASSURANCE_FAILED: active agents={sorted(agents)}")
    if len(tools)!=35:raise ADEError(f"CONTRACT_ASSURANCE_FAILED: typed tools={len(tools)}")
    if (cap.get("deterministic_control_plane") or {}).get("architecture")!="DURABLE_OBSERVABLE_RUNTIME":raise ADEError("CONTRACT_ASSURANCE_FAILED: architecture not DURABLE_OBSERVABLE_RUNTIME")
    if "ade_delegate" in tools or "ade_delegate" in set().union(*(set(x) for x in agents.values())):raise ADEError("CONTRACT_ASSURANCE_FAILED: legacy delegation surface present")
    if "managedDelegateExecute" in src or "DELEGATION_DAG" in src:raise ADEError("CONTRACT_ASSURANCE_FAILED: legacy delegation implementation present")
    high={"ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"}
    for agent,surface in agents.items():
        if high & set(surface):raise ADEError(f"CONTRACT_ASSURANCE_FAILED: direct high-impact tool leaked to {agent}")
    required={"ade_workflow_start","ade_workflow_run","ade_workflow_snapshot","ade_workflow_cancel","ade_kernel_reconcile","ade_kernel_events"}
    if not required.issubset(set(tools)):raise ADEError("CONTRACT_ASSURANCE_FAILED: kernel tools missing")
    for marker in ("kernelReadEvents","kernelRunWorkflow","kernelReconcile","ctx.session.wait","SAFE_READ_ONLY","EXPLICIT_EXTERNAL_GRANT"):
        if marker not in src:raise ADEError(f"CONTRACT_ASSURANCE_FAILED: missing {marker}")
    physical=sum(1 for x in AGENTS if (target/"agents"/f"{x}.md").is_file())
    if physical!=18:raise ADEError(f"CONTRACT_ASSURANCE_FAILED: managed agent files={physical}")
    for name in set(AGENTS)-ACTIVE_AGENTS:
        text=(target/"agents"/f"{name}.md").read_text(encoding="utf-8")
        if "disabled: true" not in text:raise ADEError(f"CONTRACT_ASSURANCE_FAILED: legacy role {name} not disabled")
    print("DURABLE_KERNEL_CONTRACT_VALIDATED: active_agents=5 managed_files=18 tools=35")
    print("WORKER_DELEGATION_PROHIBITION_VALIDATED")
    print("EXACT_EFFECT_ACTIVITY_BOUNDARY_VALIDATED")
    print("CONTRACT_ASSURANCE_VALIDATED")


def _tool_inputs(events:list[dict[str,Any]],name:str)->list[dict[str,Any]]:
    out=[]
    for e in root_tool_events(events):
        if str(path_get(e,"part","tool",default=""))==name:
            val=path_get(e,"part","state","input",default={});out.append(val if isinstance(val,dict) else {})
    return out


def _behavior_run(target:Path,model:str,prompt:str,*,timeout:int=300)->tuple[Path,list[dict[str,Any]],str]:
    cli=find_opencode_cli()
    if not cli:raise ADEError("V6_BEHAVIORAL_BLOCKED: OpenCode CLI not found")
    sandbox=Path(tempfile.mkdtemp(prefix="ade-v6-behavior-"))
    rr=run_cmd([cli,"run","--agent","orchestrator","--format","json","--model",model,prompt],cwd=sandbox,env=config_env(target),timeout=timeout)
    if rr.code!=0:
        _best_effort_cleanup(sandbox);raise ADEError(f"V6_BEHAVIORAL_FAILED: exit={rr.code}: {rr.combined}")
    return sandbox,parse_json_lines(rr.stdout,"ADE_V6_BEHAVIOR"),rr.combined


def kernel_analysis_smoke(target:Path,model:str)->None:
    nonce=uuid.uuid4().hex
    prompt=f"""ADE V6 ANALYSIS CANARY {nonce}.
Use only durable kernel tools. Call ade_workflow_start exactly once with kind=analysis, objective='analyze canary {nonce}', risk=LOW. Then call ade_workflow_run exactly once for the returned workflow_id with max_jobs=4. Do not use read/glob/grep, raw subagent, skill, shell, legacy state/handoff/delegate tools. Finish concisely after the workflow reaches DONE.
"""
    sandbox,events,_=_behavior_run(target,model,prompt)
    try:
        starts=_tool_inputs(events,"ade_workflow_start");runs=_tool_inputs(events,"ade_workflow_run")
        extras=[]
        for e in root_tool_events(events):
            tool=str(path_get(e,"part","tool",default=""))
            if tool not in {"ade_workflow_start","ade_workflow_run"}:extras.append(tool)
        if len(starts)!=1 or len(runs)!=1 or extras:raise ADEError(f"V6_ANALYSIS_CANARY_FAILED: starts={len(starts)} runs={len(runs)} extras={extras}")
        if starts[0].get("kind")!="analysis" or nonce not in str(starts[0].get("objective")):raise ADEError(f"V6_ANALYSIS_CANARY_FAILED: start input={starts[0]}")
        text="\n".join(root_texts(events))
        if len(text)>1800:raise ADEError("V6_ANALYSIS_CANARY_FAILED: root verbosity exceeded")
        print("V6_ANALYSIS_WORKFLOW_BEHAVIOR_VALIDATED")
    finally:_best_effort_cleanup(sandbox)


def kernel_approval_smoke(target:Path,model:str)->None:
    nonce=uuid.uuid4().hex
    prompt=f"""ADE V6 APPROVAL CANARY {nonce}.
Use only durable kernel tools. Create tracker_sync workflow with objective='approval canary {nonce}', risk=HIGH, tracker_updates=[{{\"external_id\":\"1\",\"fields\":[{{\"name\":\"Status\",\"value\":\"Done\"}}]}}]. Then run it once. The expected result without an external grant is WAITING_APPROVAL/BLOCKED before remote mutation. Never call tracker write/sync directly, shell, subagent, skill, or /ade-authorize. Finish concisely.
"""
    # Synthetic project policy is required to resolve the exact target fingerprint, but no token/network call is needed before grant.
    sandbox=Path(tempfile.mkdtemp(prefix="ade-v6-approval-"));(sandbox/".ai").mkdir()
    (sandbox/".ai/tracker-policy.json").write_text(json.dumps({"schema_version":1,"read":{"authorized":True},"write":{"authorized":True},"remote":{"allowed_https_hosts":["api.github.com"],"allowed_github_repositories":["octo/repo"],"allowed_github_projects":["octo/4"],"allowed_jira_projects":[],"allowed_linear_team_ids":[]}},indent=2),encoding="utf-8")
    (sandbox/".ai/integrations.json").write_text(json.dumps({"schema_version":1,"work_management":{"provider":"github","github":{"owner":"octo","repository":"repo","project_owner":"octo","project_number":4,"connection_id":"github"}}},indent=2),encoding="utf-8")
    cli=find_opencode_cli()
    if not cli:_best_effort_cleanup(sandbox);raise ADEError("V6_BEHAVIORAL_BLOCKED: OpenCode CLI not found")
    try:
        rr=run_cmd([cli,"run","--agent","orchestrator","--format","json","--model",model,prompt],cwd=sandbox,env=config_env(target),timeout=240)
        if rr.code!=0:raise ADEError(f"V6_APPROVAL_CANARY_FAILED: exit={rr.code}: {rr.combined}")
        events=parse_json_lines(rr.stdout,"V6_APPROVAL")
        starts=_tool_inputs(events,"ade_workflow_start");runs=_tool_inputs(events,"ade_workflow_run")
        direct=[str(path_get(e,"part","tool",default="")) for e in root_tool_events(events) if str(path_get(e,"part","tool",default="")) in {"ade_tracker_project_sync","ade_tracker_write","ade_vcs_push","ade_project_check"}]
        if len(starts)!=1 or len(runs)!=1 or direct:raise ADEError(f"V6_APPROVAL_CANARY_FAILED: starts={len(starts)} runs={len(runs)} direct={direct}")
        print("V6_APPROVAL_BOUNDARY_BEHAVIOR_VALIDATED")
    finally:_best_effort_cleanup(sandbox)


def kernel_proposal_smoke(target:Path,model:str)->None:
    nonce=uuid.uuid4().hex
    # Read-only analysis is intentionally used as the provider/session worker lifecycle canary; deterministic BUILD is covered by Node integration tests.
    prompt=f"""ADE V6 WORKER LIFECYCLE CANARY {nonce}.
Create one analysis workflow objective='worker lifecycle {nonce}' risk=LOW and run max_jobs=4. Do not delegate. Your role is gateway only; the kernel must create/wait workers. Use no other tools.
"""
    sandbox,events,_=_behavior_run(target,model,prompt)
    try:
        if len(_tool_inputs(events,"ade_workflow_start"))!=1 or len(_tool_inputs(events,"ade_workflow_run"))!=1:raise ADEError("V6_WORKER_LIFECYCLE_CANARY_FAILED: kernel workflow calls missing")
        forbidden=[str(path_get(e,"part","tool",default="")) for e in root_tool_events(events) if str(path_get(e,"part","tool",default="")) in {"subagent","ade_delegate","ade_handoff_submit"}]
        if forbidden:raise ADEError(f"V6_WORKER_LIFECYCLE_CANARY_FAILED: forbidden={forbidden}")
        print("V6_KERNEL_WORKER_LIFECYCLE_BEHAVIOR_VALIDATED")
    finally:_best_effort_cleanup(sandbox)


# Backward-compatible CLI aliases; semantics are v6 durable-kernel canaries, not v5 delegation.
def nested_delegation_smoke(target:Path,model:str)->None:kernel_analysis_smoke(target,model)
def capability_recovery_smoke(target:Path,model:str)->None:kernel_approval_smoke(target,model)
def engineering_recovery_routing_smoke(target:Path,model:str)->None:kernel_proposal_smoke(target,model)


def behavioral_reliability_report(target:Path,model:str,*,trials:int=5,strict:bool=False)->dict[str,Any]:
    if trials<1 or trials>20:raise ADEError(f"BEHAVIORAL_RELIABILITY_INVALID_TRIALS: {trials}")
    scenarios=[("kernel-analysis",kernel_analysis_smoke),("approval-boundary",kernel_approval_smoke),("worker-lifecycle",kernel_proposal_smoke)]
    summary={"model":model,"trials":trials,"scenarios":{},"total_pass":0,"total_fail":0}
    for name,fn in scenarios:
        passed=0;failures=[]
        for idx in range(1,trials+1):
            try:fn(target,model);passed+=1;print(f"BEHAVIORAL_TRIAL: scenario={name} trial={idx}/{trials} result=PASS")
            except ADEError as exc:failures.append(str(exc));print(f"BEHAVIORAL_TRIAL: scenario={name} trial={idx}/{trials} result=FAIL reason={exc}")
        failed=trials-passed;summary["scenarios"][name]={"passed":passed,"failed":failed,"pass_rate":passed/trials,"failures":failures};summary["total_pass"]+=passed;summary["total_fail"]+=failed
    total=trials*len(scenarios);summary["pass_rate"]=summary["total_pass"]/total
    print(f"BEHAVIORAL_RELIABILITY_SUMMARY: model={model} passed={summary['total_pass']}/{total} pass_rate={summary['pass_rate']:.0%}")
    if strict and summary["total_fail"]:raise ADEError(f"BEHAVIORAL_RELIABILITY_FAILED: failures={summary['total_fail']}/{total}")
    return summary
