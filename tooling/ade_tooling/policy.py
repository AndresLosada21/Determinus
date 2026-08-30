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
    _expect(len(cap.get("tools", {})) == 25, f"TOOL_COUNT_INVALID: {len(cap.get('tools', {}))}")
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

    for name, path in agent_files.items():
        fm, body = parse_frontmatter(path)
        _expect(deny_all_present(path), f"{name}: deny-all ausente")
        _expect("subagent_depth" not in fm, f"{name}: per-agent subagent_depth não suportado")
        perms = fm.get("permissions", [])
        if name in LEAF_AGENTS:
            _expect(not any(p.get("effect") == "ask" for p in perms), f"{name}: leaf não pode depender de ask")
            _expect(not any(p.get("action") == "subagent" and p.get("effect") == "allow" for p in perms), f"{name}: leaf não pode criar subagent")
        _expect(not any(p.get("action") == "external_directory" and p.get("effect") == "allow" for p in perms), f"{name}: external_directory allow proibido")
        _expect(not any(p.get("action") == "shell" and p.get("effect") == "allow" for p in perms), f"{name}: raw shell allow proibido")
        ade_allowed = allowed_actions(path, "ade_")
        expected = set(cap["agents"][name])
        _expect(ade_allowed == expected, f"{name}: ADE permissions drift missing={sorted(expected-ade_allowed)} extra={sorted(ade_allowed-expected)}")
        _expect("Não carregue `ai-driven-engineering` automaticamente" in body or "Não carregue a skill" in body or "não carregue" in body.lower(), f"{name}: lazy-skill invariant ausente")

    pm_fm, pm_body = parse_frontmatter(agent_files["project-manager"])
    _expect("tracker-operator" in {p.get("resource") for p in pm_fm["permissions"] if p.get("action") == "subagent" and p.get("effect") == "allow"}, "project-manager: tracker-operator não permitido")
    for marker in ("ROUTING_POLICY: STATE_DRIVEN", "TRACKER_AUTHORITY: EXECUTION_ONLY", "COMPACT_HANDOFF"):
        _expect(marker in pm_body, f"project-manager: marker ausente {marker}")

    eng_body = parse_frontmatter(agent_files["engineer"])[1]
    for marker in ("ROUTING_POLICY: STATE_DRIVEN", "HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE", "COMPACT_HANDOFF"):
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

    # Retry is bounded mitigation, not an infinite loop.
    _expect('ctx.session.hook("retry"' in src, "retry hook ausente")
    _expect('Number(event.attempt||0)<3' in src and 'tool[_ ]choice' in src and 'auto/i.test(message)' in src, "bounded tool_choice retry ausente")
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
    _expect("trackerPolicy=await readJson(trackerPolicyPath)" in src and 'mode==="write"&&!i.dry_run&&trackerPolicy.write?.authorized!==true' in src, "tracker write gate ausente")

    for marker in ("blockedExecutables", "powershell.exe", "cmd.exe", "bash", "docker", "podman", "git", 'args.some((x:string)=>x.includes("\\0"))'):
        _expect(marker in src, f"project-check bypass guard ausente {marker}")
    _expect("safeExistingRealPath" in src and "fs.realpath(root)" in src and "fs.realpath(lexical)" in src, "realpath boundary ausente")
    for marker in ("project_root=${root}", "policy=.ai/execution-policy.json", "available=["):
        _expect(marker in src, f"project-check diagnostics ausente {marker}")

    _expect('{{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}' in src, "safe docker ps format ausente")
    _expect('{{.Id}}\\t{{json .RepoTags}}\\t{{.Size}}\\t{{.Created}}' in src, "safe docker image format ausente")

    pkg = load_json(root / "plugin/package.json")
    _expect(pkg.get("version") == VERSION, "plugin package version mismatch")
    _expect(pkg.get("exports") == "./src/index.ts", "plugin exports inválido")
    _expect("@opencode-ai/plugin" not in (pkg.get("dependencies") or {}), "host SDK não deve ser bundled")
    _expect((pkg.get("peerDependencies") or {}).get("@opencode-ai/plugin") is not None, "host SDK peerDependency ausente")
    _expect('import { Plugin } from "@opencode-ai/plugin"' in src and "export default Plugin.define({" in src, "Promise Plugin.define ausente")
    _expect("ctx.location?.project" not in src and "ctx.location?.directory" not in src, "ctx.location usado como project root")
    _expect("event.system.push" not in src and "event.system =" not in src, "context hook não pode fabricar SystemPart")

    # Templates are a byte-identical fallback surface.
    a=root / "skills/ai-driven-engineering/templates"; b=root / "plugin/assets/project-templates"
    for p in b.glob("*"):
        if p.is_file():
            q=a/p.name
            _expect(q.is_file() and q.read_bytes()==p.read_bytes(), f"template drift {p.name}")

    return ["STATIC_POLICY_OK"]
