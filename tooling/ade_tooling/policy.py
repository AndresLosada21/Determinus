from __future__ import annotations

import json
import re
from pathlib import Path

from .common import ADEError, AGENTS, VERSION, allowed_actions, deny_all_present, load_json, package_root, parse_frontmatter, read_text

LEAF_AGENTS = {
    "explorer","researcher","modeler","engineering-planner","tester","implementer","verifier","debugger",
    "reviewer","security-reviewer","integrator","documenter","tracker-operator","vcs-operator",
}


def _expect(cond: bool, message: str) -> None:
    if not cond:
        raise ADEError(message)


def _tool_add_names(src: str) -> set[str]:
    return set(re.findall(r'\badd\("(ade_[A-Za-z0-9_]+)"', src))


def static_policy(root: Path | None = None) -> list[str]:
    root = (root or package_root()).resolve()
    _expect(read_text(root / "VERSION").strip() == VERSION, "VERSION_INVALID")
    agent_files = {p.stem: p for p in (root / "agents").glob("*.md")}
    _expect(set(agent_files) == set(AGENTS), f"AGENT_SET_INVALID: {sorted(set(agent_files)^set(AGENTS))}")

    cap = load_json(root / "plugin/capabilities.json")
    _expect(cap.get("version") == VERSION, "CAPABILITY_VERSION_MISMATCH")
    _expect(cap.get("plugin_id") == "ai-driven-engineering.native", "PLUGIN_ID_MISMATCH")
    _expect(set(cap.get("agents", {})) == set(AGENTS), "CAPABILITY_AGENT_SET_MISMATCH")
    _expect(len(cap.get("tools", {})) == 28, f"TOOL_COUNT_INVALID: {len(cap.get('tools', {}))}")
    budgets = cap.get("generation_max_tokens") or {}
    _expect(set(budgets) == set(AGENTS), "GENERATION_BUDGET_AGENT_SET_MISMATCH")
    _expect(all(isinstance(v, int) and 500 <= v <= 2000 for v in budgets.values()), "GENERATION_BUDGET_INVALID")

    src = read_text(root / "plugin/src/index.ts")
    registered = _tool_add_names(src)
    _expect(registered == set(cap["tools"]), f"TOOL_REGISTRY_DRIFT: missing={sorted(set(cap['tools'])-registered)} extra={sorted(registered-set(cap['tools']))}")

    # V2 nesting config is global/experimental, never top-level or per-agent.
    cfg = read_text(root / "opencode-fragment.jsonc")
    _expect('"experimental"' in cfg and '"subagent_depth": 2' in cfg, "V2_EXPERIMENTAL_SUBAGENT_DEPTH_MISSING")
    # Parse location roughly: no root key before experimental.
    _expect(not re.search(r'(?m)^  \"subagent_depth\"\s*:', cfg), "TOP_LEVEL_SUBAGENT_DEPTH_FORBIDDEN")

    HUMAN_ASK_REQUIRED = {"ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"}
    for name, path in agent_files.items():
        fm, body = parse_frontmatter(path)
        _expect(deny_all_present(path), f"{name}: deny-all ausente")
        _expect("subagent_depth" not in fm, f"{name}: per-agent subagent_depth não suportado")
        perms = fm.get("permissions", [])
        if name in LEAF_AGENTS:
            _expect(not any(p.get("action") == "subagent" and p.get("effect") == "allow" for p in perms), f"{name}: leaf não pode criar subagent")
            for p in perms:
                if p.get("effect") == "ask":
                    _expect(p.get("action") in HUMAN_ASK_REQUIRED, f"{name}: leaf ask só permitido para human-authorized tools, encontrado {p.get('action')}")
        _expect(not any(p.get("action") == "external_directory" and p.get("effect") == "allow" for p in perms), f"{name}: external_directory allow proibido")
        _expect(not any(p.get("action") == "shell" and p.get("effect") == "allow" for p in perms), f"{name}: raw shell allow proibido")
        ade_allowed_allow = {p.get("action","") for p in perms if p.get("effect")=="allow" and str(p.get("action","")).startswith("ade_")}
        ade_allowed_ask = {p.get("action","") for p in perms if p.get("effect")=="ask" and str(p.get("action","")).startswith("ade_")}
        ade_all = ade_allowed_allow | ade_allowed_ask
        expected = set(cap["agents"][name])
        _expect(ade_all == expected, f"{name}: ADE permissions drift missing={sorted(expected-ade_all)} extra={sorted(ade_all-expected)}")
        # high-impact tools must be ask, not allow
        for tool in (HUMAN_ASK_REQUIRED & expected):
            _expect(tool in ade_allowed_ask, f"{name}: {tool} deve ser ask (human authorization), não allow")
            _expect(tool not in ade_allowed_allow, f"{name}: {tool} não pode ser allow")
        _expect("Não carregue `ai-driven-engineering` automaticamente" in body or "Não carregue a skill" in body or "não carregue" in body.lower(), f"{name}: lazy-skill invariant ausente")

    pm_fm, pm_body = parse_frontmatter(agent_files["project-manager"])
    _expect("tracker-operator" in {p.get("resource") for p in pm_fm["permissions"] if p.get("action") == "subagent" and p.get("effect") == "allow"}, "project-manager: tracker-operator não permitido")
    for marker in ("ROUTING_POLICY: STATE_DRIVEN", "TRACKER_AUTHORITY: EXECUTION_ONLY", "EXECUTION_POLICY: DELEGATION_DRIVEN", "Handoff canônico"):
        _expect(marker in pm_body, f"project-manager: marker ausente {marker}")

    eng_body = parse_frontmatter(agent_files["engineer"])[1]
    for marker in ("ROUTING_POLICY: STATE_DRIVEN", "HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE", "EXECUTION_POLICY: DELEGATION_DRIVEN", "Handoff canônico"):
        _expect(marker in eng_body, f"engineer: marker ausente {marker}")

    orch_body = parse_frontmatter(agent_files["orchestrator"])[1]
    for marker in ("ROUTING_POLICY: STATE_DRIVEN", "HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE", "SUBAGENT_CONFIRMATION: NOT_REQUIRED", "ROUTING_FAILURE: ROUTING_BLOCKED", "USER_BRIEF"):
        _expect(marker in orch_body, f"orchestrator: marker ausente {marker}")
    _expect("ade_doctor" not in cap["agents"]["orchestrator"], "orchestrator: ade_doctor não pode estar no happy path")
    _expect(set(cap["agents"]["orchestrator"]) == {"ade_status","ade_route_snapshot"}, "orchestrator: estado/capabilities não estão mínimos")

    explorer_body = parse_frontmatter(agent_files["explorer"])[1]
    for marker in ("DENIAL_SEMANTICS: ACTION_RESOURCE_SCOPED", "DENIAL_GLOBAL_INFERENCE: FORBIDDEN", "AUTHORIZED_FALLBACK: REQUIRED_WHEN_AVAILABLE", "PARENT_EXECUTION_REQUIRED", "required_owner: project-manager", "execution_owner: tracker-operator"):
        _expect(marker in explorer_body, f"explorer: recovery marker ausente {marker}")

    vcs_perms = parse_frontmatter(agent_files["vcs-operator"])[0]["permissions"]
    _expect(not any(p.get("action") in ("shell", "edit", "subagent") and p.get("effect") == "allow" for p in vcs_perms), "vcs-operator: raw shell/edit/subagent proibido")
    _expect(set(cap["agents"]["vcs-operator"]).issuperset({"ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"}), "vcs-operator: VCS tools ausentes")
    for agent in AGENTS:
        hidden = set((cap.get("hide_core_tools") or {}).get(agent, []))
        _expect({"shell", "execute"}.issubset(hidden), f"{agent}: shell/execute devem estar ocultos")

    # Skill must really be lazy/explicit.
    skill = read_text(root / "skills/ai-driven-engineering/SKILL.md")
    _expect('opencode/autoinvoke: "false"' in skill, "SKILL_AUTOINVOKE_MUST_BE_FALSE")

    # Evidence/state hardening and observability.
    for marker in ("normalizeEvidence", "Array.isArray(value)", "evidence.jsonl", "telemetry.jsonl", "evidence_count", "compactControl", "routingHint"):
        _expect(marker in src, f"state/evidence hardening ausente {marker}")
    _expect('const limit=i.limit||5' in src, "evidence query default deve ser 5")
    _expect('detail:str({enum:["compact","full"]})' in src, "state_get compact/full selector ausente")
    _expect('add("ade_route_snapshot"' in src, "ade_route_snapshot ausente")
    _expect('add("ade_handoff_submit"' in src, "ade_handoff_submit ausente")
    _expect("HANDOFF_SCHEMA_VIOLATION" in src and "HANDOFF_AUTHORITY_VIOLATION" in src, "handoff enforcement ausente")
    _expect("handoffs.jsonl" in src and "recent_handoffs" in src, "canonical handoff persistence ausente")
    for agent in AGENTS:
        if agent != "orchestrator":
            _expect("ade_handoff_submit" in cap["agents"][agent], f"{agent}: handoff capability ausente")

    # Retry/circuit breaker: deterministic request incompatibility is never retried; transient same-signature expiry gets one retry.
    _expect('ctx.session.hook("retry"' in src, "retry hook ausente")
    for marker in ("normalizedFailureSignature","retrySignatures","tool_choice:auto-only","reasoning item expired","seen===0","seen>0"):
        _expect(marker in src, f"provider circuit breaker ausente {marker}")
    _expect('ctx.session.hook("context"' in src and 'event.generation.maxTokens' in src, "generation budget hook ausente")

    # Critical VCS/security invariants.
    _expect('add("ade_vcs_push"' in src and 'schemaObject({})' in src, "ade_vcs_push schema inválido")
    _expect("--force" not in src and "force-with-lease" not in src, "force push surface detectada")
    _expect("assertNoSecretStaged" in src and "await assertNoSecretStaged(root)" in src, "staged-secret guard ausente")
    _expect("--literal-pathspecs" in src, "literal pathspec guard ausente")
    _expect("relativeLiteralPath(root,p)" in src and "if(!paths.length)" in src, "stage path/root guard ausente")

    exclusive = {
        "ade_product_validation_record": "product-owner",
        "ade_delivery_validation_record": "project-manager",
        "ade_engineering_validation_record": "verifier",
    }
    for tool, owner in exclusive.items():
        for agent, tools in cap["agents"].items():
            _expect((tool in tools) == (agent == owner), f"{tool}: ownership inválido em {agent}")
    _expect('state:str({enum:["OBSERVADO","INFERIDO","PROPOSTO","DESCONHECIDO"]})' in src, "generic evidence deve excluir VALIDADO")
    for marker in ("plane_revision", "validated_status", "VALIDATION_BLOCKED"):
        _expect(marker in src, f"fresh-validation marker ausente {marker}")

    _expect("ade_diagnostic_check" in cap["agents"]["debugger"] and "ade_project_check" not in cap["agents"]["debugger"], "debugger boundary inválida")
    _expect("ade_project_check" in cap["agents"]["verifier"], "verifier project check ausente")
    _expect('nativeProjectCheck(root:string,name:string,expectedOwner:"verifier"|"debugger"="verifier",validationAuthority=true)' in src, "executor separation ausente")
    _expect('DIAGNOSTIC_CHECK_COMPLETED' in src, "diagnostic marker ausente")

    _expect(cap["agents"]["tracker-operator"].count("ade_tracker_read") == 1 and cap["agents"]["tracker-operator"].count("ade_tracker_write") == 1, "tracker split inválido")
    _expect(set(cap["agents"]["tracker-operator"]) == {"ade_tracker_read","ade_tracker_write","ade_handoff_submit"}, "tracker leaf surface não mínima")
    _expect({"read","glob","grep","skill"}.issubset(set((cap.get("hide_core_tools") or {}).get("tracker-operator",[]))), "tracker workspace discovery não oculto")
    _expect('trackerPolicy=await readProjectJson(root,".ai/tracker-policy.json","tracker policy")' in src and 'mode==="write"&&!i.dry_run&&trackerPolicy.write?.authorized!==true' in src, "tracker write gate ausente")
    _expect({"ade_tracker_project_snapshot","ade_tracker_project_sync"}.issubset(set(cap["agents"]["project-manager"])), "project-manager deterministic tracker path ausente")
    _expect('updateProjectV2ItemFieldValue' in src and 'TRACKER_VERIFY_FAILED' in src and 'canonical_handoff' in src and 'post_state' in src, "deterministic tracker sync/read-back ausente")

    for marker in ("blockedExecutables", "powershell.exe", "cmd.exe", "bash", "docker", "podman", "git", r'x.includes("\0")'):
        _expect(marker in src, f"project-check bypass guard ausente {marker}")
    _expect("safeExistingRealPath" in src and "fs.realpath(root)" in src and "fs.realpath(lexical)" in src, "realpath boundary ausente")
    for marker in ("project_root=${root}", "policy=.ai/execution-policy.json", "available=["):
        _expect(marker in src, f"project-check diagnostics ausente {marker}")

    _expect('{{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}' in src, "safe docker ps format ausente")
    _expect('{{.Id}}\\t{{json .RepoTags}}\\t{{.Size}}\\t{{.Created}}' in src, "safe docker image format ausente")

    # Heavy hardening invariants.
    for marker in ("readProjectJson","LOG_CORRUPT","LOG_UNSAFE","redactForModel","minimalEnv","resolveTrustedExecutable",'redirect:"error"',"AbortController","allow_mutable_image","allow_network","--read-only","--cap-drop","ALL","no-new-privileges","assertNoSecretStaged"):
        _expect(marker in src, f"heavy-hardening marker ausente {marker}")
    _expect('commit.gpgSign=false' not in src, "commit signing não pode ser desativado")
    _expect('policy.hooks?.allow_bypass===true' in src, "hook bypass não está explicitamente policy-gated")
    _expect('session_ref' in src and 'session_id:' not in src, "telemetria deve pseudonimizar session id")

    # Human authorization boundary: repo policy != human authority, high-impact tools must be ask-gated.
    _expect('HUMAN_AUTHORIZATION_REQUIRED' in src and 'ADE_HUMAN_AUTHORIZATION_REQUIRED' in src, "human authorization boundary ausente no plugin")
    _expect('repo policy' in src.lower() or 'repositório' in src.lower() or 'policy do repositório' in src.lower(), "documentação de repo policy vs human authority ausente")
    _expect('AUTO_APPROVED' in src and 'USER_APPROVED' in src, "auto-approve distinction ausente")
    _expect('event.effect="ask"' in src, "permission ask enforcement ausente")
    for tool in ("ade_tracker_project_sync","ade_tracker_write","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create","ade_project_check","ade_diagnostic_check"):
        _expect(tool in src and 'HUMAN_AUTHORIZATION_REQUIRED' in src, f"human auth set ausente para {tool}")

    pkg = load_json(root / "plugin/package.json")
    _expect(pkg.get("version") == VERSION, "plugin package version mismatch")
    _expect(pkg.get("exports") == "./src/index.ts", "plugin exports inválido")
    _expect("@opencode-ai/plugin" not in (pkg.get("dependencies") or {}), "host SDK não deve ser bundled")
    _expect((pkg.get("peerDependencies") or {}).get("@opencode-ai/plugin") is not None, "host SDK peerDependency ausente")
    _expect('import * as OpenCodePlugin from "@opencode-ai/plugin"' in src and 'pluginDefine' in src and 'Plugin?.define' in src and 'raw-default-compat' in src and 'export default pluginDefine({' in src, "Promise plugin compatibility adapter ausente")
    _expect("ctx.location?.project" not in src and "ctx.location?.directory" not in src, "ctx.location usado como project root")
    _expect("event.system.push" not in src and "event.system =" not in src, "context hook não pode fabricar SystemPart")

    # Templates are a byte-identical fallback surface.
    a=root / "skills/ai-driven-engineering/templates"; b=root / "plugin/assets/project-templates"
    for p in b.glob("*"):
        if p.is_file():
            q=a/p.name
            _expect(q.is_file() and q.read_bytes()==p.read_bytes(), f"template drift {p.name}")

    return ["STATIC_POLICY_OK"]
