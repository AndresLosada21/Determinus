from __future__ import annotations

import os
import re
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


def plugin_runtime_smoke(target: Path, model: str | None = None) -> None:
    cli = find_opencode_cli()
    if not cli:
        raise ADEError("PLUGIN_RUNTIME_BLOCKED: OpenCode CLI não encontrado")
    r = run_cmd([cli,"plugin","list"], env=config_env(target), timeout=45)
    if r.code != 0:
        raise ADEError(f"PLUGIN_RUNTIME_BLOCKED: plugin list falhou: {r.combined}")
    if "ai-driven-engineering" not in r.combined.lower():
        raise ADEError("PLUGIN_RUNTIME_BLOCKED: ADE plugin não aparece em plugin list")
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


def _validate_tool_record(msg: dict, entry: dict, agent: str, allowed_subagent: str | None = None) -> tuple[str, str | None]:
    if msg.get("type") != "assistant" or msg.get("agent") != agent:
        raise ADEError(f"tool record não pertence a assistant/{agent}")
    tool = str(entry.get("name", ""))
    status = str(path_get(entry,"state","status",default=""))
    if status != "completed":
        raise ADEError(f"{agent}: tool {tool} status={status}")
    if tool == "skill":
        if str(path_get(entry,"state","input","id",default="")) != "ai-driven-engineering":
            raise ADEError(f"{agent}: skill divergente")
        return tool, None
    if tool == "subagent" and allowed_subagent:
        target = str(path_get(entry,"state","input","agent",default=""))
        if target != allowed_subagent:
            raise ADEError(f"{agent}: subagent divergente {target}")
        child = str(path_get(entry,"state","metadata","sessionID",default=""))
        if not child:
            raise ADEError(f"{agent}: child sessionID ausente")
        return tool, child
    raise ADEError(f"{agent}: tool não permitida no smoke {tool}")


def nested_delegation_smoke(target: Path, model: str) -> None:
    cli = find_opencode_cli()
    if not cli:
        raise ADEError("NESTED_DELEGATION_FAILED: OpenCode CLI não encontrado")
    nonce = uuid.uuid4().hex
    level1 = f"NESTED_LEVEL1_{nonce}"
    level2 = f"NESTED_LEVEL2_{nonce}"
    prompt = f"""NESTED DELEGATION OPERATIONAL SMOKE {nonce}.
Você é o orchestrator. É proibido ler ou escrever arquivos, usar shell, web, rede, provider externo ou credenciais. Além da cadeia subagent, cada agent pode carregar no máximo uma vez a skill ai-driven-engineering se o system prompt exigir. Nenhuma outra tool é permitida.
1. invoque project-manager como subagent;
2. no brief, instrua project-manager a invocar tracker-operator como subagent;
3. tracker-operator deve responder exatamente {level2};
4. project-manager deve retornar exatamente {level1} somente depois de receber {level2};
5. finalize exatamente NESTED_DELEGATION_OK somente após ambas as invocações concluírem.
"""
    sandbox = Path(tempfile.mkdtemp(prefix="ade-v520-nested-"))
    try:
        rr = run_cmd([cli,"run","--agent","orchestrator","--format","json","--model",model,prompt], cwd=sandbox, env=config_env(target), timeout=300)
        if rr.code != 0:
            raise ADEError(f"NESTED_DELEGATION_FAILED: root exit={rr.code}: {rr.combined}")
        events = parse_json_lines(rr.stdout, "NESTED_ROOT")
        skill_count = 0
        handoffs: list[tuple[str,str]] = []
        for e in root_tool_events(events):
            tool = str(path_get(e,"part","tool",default=""))
            status = str(path_get(e,"part","state","status",default=""))
            if status != "completed":
                raise ADEError(f"NESTED_DELEGATION_FAILED: root tool {tool} status={status}")
            if tool == "skill":
                if str(path_get(e,"part","state","input","id",default="")) != "ai-driven-engineering":
                    raise ADEError("NESTED_DELEGATION_FAILED: root skill divergente")
                skill_count += 1
            elif tool == "subagent":
                if str(path_get(e,"part","state","input","agent",default="")) != "project-manager":
                    raise ADEError("NESTED_DELEGATION_FAILED: root subagent não é project-manager")
                root_id = str(e.get("sessionID", ""))
                child = str(path_get(e,"part","state","metadata","sessionID",default=""))
                if not root_id or not child:
                    raise ADEError("NESTED_DELEGATION_FAILED: root/child sessionID ausente")
                handoffs.append((root_id, child))
            else:
                raise ADEError(f"NESTED_DELEGATION_FAILED: root tool extra {tool}")
        if skill_count > 1 or not handoffs:
            raise ADEError("NESTED_DELEGATION_FAILED: root handoff/skill inválido")
        root_id, pm_id = handoffs[-1]
        pm = export_session(cli, pm_id, target)
        assert_export_info(pm, session_id=pm_id, parent_id=root_id, agent="project-manager", label="PM")
        pm_skill = 0; tracker_ids: list[str] = []
        for msg, entry in export_tool_records(pm):
            tool, child = _validate_tool_record(msg, entry, "project-manager", "tracker-operator")
            if tool == "skill": pm_skill += 1
            if child: tracker_ids.append(child)
        if pm_skill > 1 or not tracker_ids:
            raise ADEError("NESTED_DELEGATION_FAILED: PM handoff/skill inválido")
        tracker_id = tracker_ids[-1]
        tracker = export_session(cli, tracker_id, target)
        assert_export_info(tracker, session_id=tracker_id, parent_id=pm_id, agent="tracker-operator", label="Tracker")
        tracker_skill = 0
        for msg, entry in export_tool_records(tracker):
            tool, _ = _validate_tool_record(msg, entry, "tracker-operator", None)
            if tool == "skill": tracker_skill += 1
        if tracker_skill > 1:
            raise ADEError("NESTED_DELEGATION_FAILED: tracker skill > 1")
        if not has_assistant_marker(pm,"project-manager",level1):
            raise ADEError("NESTED_DELEGATION_FAILED: PM marker ausente")
        if not has_assistant_marker(tracker,"tracker-operator",level2):
            raise ADEError("NESTED_DELEGATION_FAILED: tracker marker ausente")
        if "NESTED_DELEGATION_OK" not in [x.strip() for x in root_texts(events)]:
            raise ADEError("NESTED_DELEGATION_FAILED: root marker ausente")
        print("NESTED_DELEGATION_OK")
        print("SUBAGENT_DEPTH_VALIDATED: orchestrator -> project-manager -> tracker-operator")

    finally:
        _best_effort_cleanup(sandbox)

def _assistant_text_from_events(events: list[dict]) -> str:
    return "\n".join(root_texts(events))


def capability_recovery_smoke(target: Path, model: str) -> None:
    cli = find_opencode_cli()
    if not cli:
        raise ADEError("CAPABILITY_RECOVERY_FAILED: OpenCode CLI não encontrado")
    scenarios = [
        ("explorer","explorer-cross-plane", """CAPABILITY DENIAL RECOVERY SMOKE. Não execute tools; classifique apenas a evidência fornecida.
EVIDÊNCIA OBSERVADA: agent=explorer; attempted_action=shell; attempted_resource=gh issue view 95 --json number,title,body,state,labels,milestone; observed_error=Permission denied: shell; requested_evidence=body/state/labels/milestone da issue 95.
Inclua literalmente:
CAPABILITY_DENIAL_RECOVERY_OK
capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY
status: PARENT_EXECUTION_REQUIRED
required_owner: project-manager
execution_owner: tracker-operator
Não diga que shell/GitHub/todas as tools estão indisponíveis e não devolva comando manual ao usuário.""",
         ["CAPABILITY_DENIAL_RECOVERY_OK","capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY","status: PARENT_EXECUTION_REQUIRED","required_owner: project-manager","execution_owner: tracker-operator"]),
        ("implementer","implementer-to-verifier", """CAPABILITY DENIAL RECOVERY SMOKE. Não execute tools; classifique apenas a evidência fornecida.
EVIDÊNCIA OBSERVADA: agent=implementer; implementation_status=mudança criada; attempted_action=shell; attempted_resource=php -l tests/Feature/TddUltraSprint4Test.php; observed_error=Permission denied: shell; requested_evidence=sintaxe PHP independente.
Inclua literalmente:
CAPABILITY_DENIAL_RECOVERY_OK
capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY
implementation_state: IMPLEMENTED_NOT_VALIDATED
status: PARENT_EXECUTION_REQUIRED
required_owner: engineer
execution_owner: verifier
Não diga que shell/todas tools estão indisponíveis, não devolva comando manual e não declare VALIDATED/ENGINEERING_ACCEPTED.""",
         ["CAPABILITY_DENIAL_RECOVERY_OK","capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY","implementation_state: IMPLEMENTED_NOT_VALIDATED","status: PARENT_EXECUTION_REQUIRED","required_owner: engineer","execution_owner: verifier"]),
    ]
    for agent, name, prompt, required in scenarios:
        sandbox = Path(tempfile.mkdtemp(prefix=f"ade-v520-cap-{name}-"))
        try:
            rr = run_cmd([cli,"run","--agent",agent,"--format","json","--model",model,prompt], cwd=sandbox, env=config_env(target), timeout=180)
            if rr.code != 0:
                raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: exit={rr.code}")
            events = parse_json_lines(rr.stdout, f"CAPABILITY[{name}]")
            text = _assistant_text_from_events(events)
            for marker in required:
                if marker not in text:
                    raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: marker ausente {marker}")
            if re.search(r"(?i)shell\s+(?:está\s+)?indisponível|shell\s+unavailable|github\s+(?:está\s+)?indisponível|all\s+tools\s+unavailable", text):
                raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: generalização global")
            if re.search(r"(?i)(rode|execute|run)\s+(?:manualmente\s+)?(?:o\s+)?(?:comando|php|gh|docker)", text):
                raise ADEError(f"CAPABILITY_RECOVERY_FAILED[{name}]: hand-back manual")
            print(f"CAPABILITY_RECOVERY_SCENARIO_OK: {name}")
        finally:
            _best_effort_cleanup(sandbox)
    print("CAPABILITY_DENIAL_RECOVERY_OK")
    print("CAPABILITY_RECOVERY_VALIDATED: explorer->PM/tracker + implementer->engineer/verifier")


def engineering_recovery_routing_smoke(target: Path, model: str) -> None:
    cli = find_opencode_cli()
    if not cli:
        raise ADEError("ENGINEERING_RECOVERY_ROUTING_FAILED: OpenCode CLI não encontrado")
    nonce = uuid.uuid4().hex
    verifier_marker = f"RECOVERY_VERIFIER_{nonce}"
    engineer_marker = f"ENGINEERING_RECOVERY_ROUTING_OK_{nonce}"
    prompt = f"""ENGINEERING RECOVERY ROUTING SMOKE {nonce}.
Envelope recebido do Implementer:
status: PARENT_EXECUTION_REQUIRED
capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY
implementation_state: IMPLEMENTED_NOT_VALIDATED
required_owner: engineer
execution_owner: verifier
requested_evidence: php -l de arquivo alterado
Você é Engineer e DEVE consumir o envelope sem devolver comando ao usuário. Invoque verifier como subagent. No brief, proíba read/edit/shell/web/rede/providers; o Verifier pode no máximo carregar uma vez a skill ai-driven-engineering e deve responder exatamente {verifier_marker}. Depois de receber esse marcador, responda exatamente {engineer_marker}.
É proibido executar php -l real, editar arquivos, usar shell/read/glob/grep/web ou emular o Verifier.
"""
    sandbox = Path(tempfile.mkdtemp(prefix="ade-v520-eng-recovery-"))
    try:
        rr = run_cmd([cli,"run","--agent","engineer","--format","json","--model",model,prompt], cwd=sandbox, env=config_env(target), timeout=240)
        if rr.code != 0:
            raise ADEError(f"ENGINEERING_RECOVERY_ROUTING_FAILED: exit={rr.code}: {rr.combined}")
        events = parse_json_lines(rr.stdout, "ENGINEERING_RECOVERY")
        skill_count = 0; handoffs: list[tuple[str,str]] = []
        for e in root_tool_events(events):
            tool = str(path_get(e,"part","tool",default="")); status = str(path_get(e,"part","state","status",default=""))
            if status != "completed":
                raise ADEError(f"ENGINEERING_RECOVERY_ROUTING_FAILED: tool {tool} status={status}")
            if tool == "skill":
                if str(path_get(e,"part","state","input","id",default="")) != "ai-driven-engineering": raise ADEError("Engineer skill divergente")
                skill_count += 1
            elif tool == "subagent":
                if str(path_get(e,"part","state","input","agent",default="")) != "verifier": raise ADEError("Engineer subagent != verifier")
                root_id = str(e.get("sessionID", "")); child = str(path_get(e,"part","state","metadata","sessionID",default=""))
                if not root_id or not child: raise ADEError("sessionIDs ausentes")
                handoffs.append((root_id, child))
            else:
                raise ADEError(f"ENGINEERING_RECOVERY_ROUTING_FAILED: tool extra {tool}")
        if skill_count > 1 or not handoffs:
            raise ADEError("ENGINEERING_RECOVERY_ROUTING_FAILED: handoff/skill inválido")
        root_id, verifier_id = handoffs[-1]
        exp = export_session(cli, verifier_id, target)
        assert_export_info(exp, session_id=verifier_id, parent_id=root_id, agent="verifier", label="Verifier")
        verifier_skill = 0
        for msg, entry in export_tool_records(exp):
            if msg.get("type") != "assistant" or msg.get("agent") != "verifier": raise ADEError("Verifier tool record inválido")
            tool = str(entry.get("name", "")); status = str(path_get(entry,"state","status",default=""))
            if tool != "skill" or status != "completed" or str(path_get(entry,"state","input","id",default="")) != "ai-driven-engineering":
                raise ADEError(f"Verifier usou tool não permitida {tool}")
            verifier_skill += 1
        if verifier_skill > 1 or not has_assistant_marker(exp,"verifier",verifier_marker):
            raise ADEError("Verifier marker/skill inválido")
        if engineer_marker not in [x.strip() for x in root_texts(events)]:
            raise ADEError("Engineer marker ausente")
        print("ENGINEERING_RECOVERY_ROUTING_OK")
        print("ENGINEERING_RECOVERY_ROUTING_VALIDATED: implementer escalation -> engineer -> verifier")
    finally:
        _best_effort_cleanup(sandbox)
