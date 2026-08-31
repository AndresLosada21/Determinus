from __future__ import annotations

import re
from pathlib import Path

from .common import ADEError, AGENTS, VERSION, deny_all_present, load_json, package_root, parse_frontmatter, read_text

ACTIVE_AGENTS = {"orchestrator", "explorer", "implementer", "verifier", "reviewer"}
DISABLED_AGENTS = set(AGENTS) - ACTIVE_AGENTS
HUMAN_REQUIRED = {
    "ade_tracker_project_sync", "ade_tracker_write", "ade_project_check", "ade_diagnostic_check",
    "ade_vcs_stage", "ade_vcs_commit", "ade_vcs_push", "ade_pr_create",
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
    _expect(set(agent_files) == set(AGENTS), f"AGENT_FILE_SET_INVALID: {sorted(set(agent_files)^set(AGENTS))}")

    cap = load_json(root / "plugin/capabilities.json")
    _expect(cap.get("version") == VERSION, "CAPABILITY_VERSION_MISMATCH")
    _expect(cap.get("plugin_id") == "ai-driven-engineering.native", "PLUGIN_ID_MISMATCH")
    _expect(set(cap.get("agents", {})) == ACTIVE_AGENTS, f"ACTIVE_AGENT_SET_INVALID: {sorted(set(cap.get('agents',{}))^ACTIVE_AGENTS)}")
    _expect(len(cap.get("tools", {})) == 34, f"TOOL_COUNT_INVALID: {len(cap.get('tools',{}))}")
    _expect(set(cap.get("generation_max_tokens", {})) == ACTIVE_AGENTS, "GENERATION_BUDGET_ACTIVE_AGENT_SET_MISMATCH")
    _expect(all(isinstance(v, int) and 500 <= v <= 2000 for v in cap["generation_max_tokens"].values()), "GENERATION_BUDGET_INVALID")

    src = read_text(root / "plugin/src/index.ts")
    registered = _tool_add_names(src)
    _expect(registered == set(cap["tools"]), f"TOOL_REGISTRY_DRIFT missing={sorted(set(cap['tools'])-registered)} extra={sorted(registered-set(cap['tools']))}")

    # v6 never depends on native subagent recursion. Keep depth shallow for compatibility only.
    cfg = read_text(root / "opencode-fragment.jsonc")
    _expect('"default_agent": "orchestrator"' in cfg, "DEFAULT_AGENT_MISSING")
    _expect('"experimental"' in cfg and '"subagent_depth": 1' in cfg, "V6_SUBAGENT_DEPTH_MUST_BE_1")
    _expect(not re.search(r'(?m)^  "subagent_depth"\s*:', cfg), "TOP_LEVEL_SUBAGENT_DEPTH_FORBIDDEN")

    for name, path in agent_files.items():
        fm, body = parse_frontmatter(path)
        _expect("subagent_depth" not in fm, f"{name}: per-agent subagent_depth unsupported")
        if name in DISABLED_AGENTS:
            _expect(str(fm.get("disabled")).lower() == "true", f"{name}: legacy role must be disabled")
            _expect("Workflow scheduling is owned by the durable kernel" in body, f"{name}: disabled tombstone explanation missing")
            continue

        _expect(deny_all_present(path), f"{name}: deny-all missing")
        perms = fm.get("permissions", [])
        _expect(not any(p.get("action") == "shell" and p.get("effect") in {"allow","ask"} for p in perms), f"{name}: raw shell forbidden")
        _expect(not any(p.get("action") == "subagent" and p.get("effect") in {"allow","ask"} for p in perms), f"{name}: worker/native subagent forbidden")
        _expect(not any(p.get("action") == "skill" and p.get("effect") in {"allow","ask"} for p in perms), f"{name}: skill loading forbidden in v6 runtime path")
        _expect(not any(p.get("action") == "external_directory" and p.get("effect") == "allow" for p in perms), f"{name}: external_directory allow forbidden")
        ade_allowed = {str(p.get("action")) for p in perms if p.get("effect") == "allow" and str(p.get("action", "")).startswith("ade_")}
        _expect(ade_allowed == set(cap["agents"][name]), f"{name}: ADE permission drift missing={sorted(set(cap['agents'][name])-ade_allowed)} extra={sorted(ade_allowed-set(cap['agents'][name]))}")
        _expect(not (HUMAN_REQUIRED & set(cap["agents"][name])), f"{name}: direct high-impact mutation capability leaked")
        hidden = set((cap.get("hide_core_tools") or {}).get(name, []))
        _expect({"shell","execute","subagent","skill"}.issubset(hidden), f"{name}: core escape surface not hidden")

    orch_fm, orch_body = parse_frontmatter(agent_files["orchestrator"])
    _expect(orch_fm.get("mode") == "primary", "orchestrator must be primary")
    _expect("durable kernel" in orch_body.lower(), "orchestrator kernel contract missing")
    _expect("never launch native subagents" in orch_body.lower() or "never create workers" in orch_body.lower() or "never coordinate workers" in orch_body.lower(), "orchestrator worker-creation prohibition missing")
    for tool in ("ade_workflow_start","ade_workflow_run","ade_workflow_snapshot","ade_kernel_reconcile"):
        _expect(tool in cap["agents"]["orchestrator"], f"orchestrator missing {tool}")

    for worker in ("explorer","implementer","verifier","reviewer"):
        fm, body = parse_frontmatter(agent_files[worker])
        _expect(str(fm.get("hidden")).lower() == "true", f"{worker}: worker must be hidden")
        _expect(fm.get("mode") == "all", f"{worker}: worker mode must be all")
        _expect("do not delegate" in body.lower() or "never coordinate" in body.lower() or "do not coordinate" in body.lower(), f"{worker}: no-delegation rule missing")
    _expect(any(p.get("action") == "edit" and p.get("effect") == "allow" for p in parse_frontmatter(agent_files["implementer"])[0].get("permissions", [])), "implementer must be only editing worker")
    for worker in ("explorer","verifier","reviewer"):
        _expect(not any(p.get("action") == "edit" and p.get("effect") == "allow" for p in parse_frontmatter(agent_files[worker])[0].get("permissions", [])), f"{worker}: edit must be denied")

    # Kernel architecture invariants.
    dk = cap.get("durable_kernel") or {}
    _expect(dk.get("schema_version") == 1, "DURABLE_KERNEL_SCHEMA_INVALID")
    _expect(dk.get("event_hash_chain") == "sha256", "DURABLE_EVENT_HASH_CHAIN_REQUIRED")
    _expect(dk.get("safe_mode_on_corruption") is True, "DURABLE_SAFE_MODE_REQUIRED")
    _expect((cap.get("deterministic_control_plane") or {}).get("architecture") == "DURABLE_KERNEL", "CONTROL_PLANE_NOT_DURABLE_KERNEL")
    for marker in (
        "kernelReadEvents", "kernelAppendDrafts", "prev_hash", "event_hash", "SAFE_READ_ONLY",
        "kernelRunWorkflow", "kernelReconcile", "lease_expires_at", "KERNEL_JOB_MAX_ATTEMPTS",
        "ctx.session.create", "ctx.session.switchAgent", "ctx.session.prompt", "ctx.session.wait", "ctx.session.context",
        "mutationLock", "mutation.lock",
    ):
        _expect(marker in src, f"DURABLE_KERNEL_MARKER_MISSING: {marker}")

    # ADE v6 removes legacy delegation physically; the kernel is the only scheduler.
    _expect("ade_delegate" not in cap["tools"], "legacy delegation tool surface must be absent")
    _expect("managedDelegateExecute" not in src and "DELEGATION_DAG" not in src, "legacy delegation implementation must be absent")
    _expect(all("ade_delegate" not in tools for tools in cap["agents"].values()), "legacy delegation leaked to active agent")

    # Exact-effect authorization and provider/security hardening survive the major rewrite.
    for marker in (
        "EXPLICIT_EXTERNAL_GRANT", "assertAuthorizationUnchanged", "resourceTouchesGrantStore", "ADE_GRANT_STORE_CORRUPT",
        "body_sha256", "staged_diff_sha256", "tree_sha", "head_sha", "definition_sha256",
        "ctx.session.hook(\"retry\"", "tool_choice:auto-only", "reasoning item expired",
        "ctx.session.hook(\"http.request\"", "auto_only_tool_choice_models",
        "assertNoSecretStaged", "redactForModel", "minimalEnv", "redirect:\"error\"", "AbortController",
        "--read-only", "--cap-drop", "ALL", "no-new-privileges", "allow_mutable_image", "allow_network",
    ):
        _expect(marker in src, f"HARDENING_MARKER_MISSING: {marker}")
    _expect("commit.gpgSign=false" not in src, "commit signing must not be disabled")
    _expect("--force" not in src and "force-with-lease" not in src, "force-push surface detected")

    # Skill is reference-only; v6 runtime does not depend on it.
    skill = read_text(root / "skills/ai-driven-engineering/SKILL.md")
    _expect('opencode/autoinvoke: "false"' in skill, "SKILL_AUTOINVOKE_MUST_BE_FALSE")

    return ["STATIC_POLICY_OK"]
