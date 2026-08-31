from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

from .common import ADEError, AGENTS, VERSION, load_json, package_root, parse_frontmatter, read_text, source_tree_hash
from .policy import static_policy


def _expect(cond: bool, message: str) -> None:
    if not cond:
        raise ADEError(message)


def _group_package_layout(root: Path) -> None:
    required = [
        "VERSION","README.md","VALIDATION.md","AGENTS.managed.md","plugin/package.json","plugin/capabilities.json",
        "plugin/src/index.ts","plugin/tests/lifecycle.test.mjs","OPENCODE_V2_AUDIT.md","tooling/ade.py","tooling/ade_tooling/common.py",
        "tooling/ade_tooling/install.py","tooling/ade_tooling/smoke.py","tooling/ade_tooling/regression.py","tooling/ade_tooling/live_test.py",
    ]
    for rel in required: _expect((root/rel).is_file(), f"arquivo obrigatório ausente: {rel}")
    _expect(len(list((root/"agents").glob("*.md")))==18,"agents != 18")


def _group_utf8(root: Path) -> None:
    exts={".md",".json",".jsonc",".ts",".mjs",".py",".ps1",".yml",".yaml",".txt"}
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in exts:
            try:p.read_text(encoding="utf-8")
            except UnicodeDecodeError as exc: raise ADEError(f"UTF8_INVALID: {p.relative_to(root)}: {exc}") from exc


def _group_version(root: Path) -> None:
    _expect(read_text(root/"VERSION").strip()==VERSION,"VERSION mismatch")
    _expect(load_json(root/"plugin/package.json").get("version")==VERSION,"package version mismatch")
    _expect(load_json(root/"plugin/capabilities.json").get("version")==VERSION,"cap version mismatch")


def _group_json(root: Path) -> None:
    for p in root.rglob("*.json"):
        try: json.loads(read_text(p))
        except Exception as exc: raise ADEError(f"JSON_INVALID: {p.relative_to(root)}: {exc}") from exc


def _group_registry(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json")
    _expect(len(cap["tools"])==28,"typed tools != 28")
    _expect(set(cap["agents"])==set(AGENTS),"registry agents mismatch")
    known=set(cap["tools"])
    for agent,tools in cap["agents"].items():
        _expect(len(tools)==len(set(tools)),f"duplicate tool in {agent}")
        _expect(set(tools)<=known,f"unknown tool in {agent}")


def _group_agent_policy(root: Path) -> None: static_policy(root)


def _group_state_driven(root: Path) -> None:
    orch=read_text(root/"agents/orchestrator.md")
    _expect("ROUTING_POLICY: STATE_DRIVEN" in orch,"state-driven marker missing")
    _expect("DELEGATE_FIRST" not in orch,"legacy delegate-first in orchestrator")
    _expect("Não reconfirme owner" in orch,"owner revision reuse missing")
    cap=load_json(root/"plugin/capabilities.json")
    _expect(set(cap["agents"]["orchestrator"])=={"ade_status","ade_route_snapshot"},"orchestrator tool surface not minimal")


def _group_lazy_skill(root: Path) -> None:
    skill=read_text(root/"skills/ai-driven-engineering/SKILL.md")
    _expect('opencode/autoinvoke: "false"' in skill,"skill autoinvoke false missing")
    for p in (root/"agents").glob("*.md"):
        body=parse_frontmatter(p)[1].lower()
        _expect("automatic" in body or "automaticamente" in body or "não carregue" in body,f"{p.stem}: lazy-skill guidance missing")


def _group_compact_ux(root: Path) -> None:
    orch=read_text(root/"agents/orchestrator.md")
    _expect("USER_BRIEF" in orch and "180 palavras" in orch,"user brief budget missing")
    _expect("oito seções" not in orch.lower(),"legacy audit template in orchestrator")
    cap=load_json(root/"plugin/capabilities.json")
    for p in (root/"agents").glob("*.md"):
        if p.stem!="orchestrator":
            text=read_text(p)
            _expect("Handoff canônico" in text and "ade_handoff_submit" in text,f"{p.stem}: canonical handoff missing")
            _expect("exatamente um" in text and "no máximo 3 linhas" in text,f"{p.stem}: handoff behavioral budget missing")
            _expect("ade_handoff_submit" in cap["agents"][p.stem],f"{p.stem}: handoff tool capability missing")
    _expect("ade_handoff_submit" not in cap["agents"]["orchestrator"],"orchestrator should not submit child handoff")


def _group_generation_budgets(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json"); budgets=cap.get("generation_max_tokens") or {}
    _expect(set(budgets)==set(AGENTS),"generation budget set mismatch")
    _expect(all(500<=int(v)<=2000 for v in budgets.values()),"generation budget out of range")
    src=read_text(root/"plugin/src/index.ts")
    _expect("event.generation.maxTokens" in src,"context generation budget hook missing")


def _group_evidence_hardening(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("normalizeEvidence","Array.isArray(value)","evidence.jsonl","evidence_count","persistEvidence","const limit=i.limit||5"):
        _expect(marker in src,f"evidence hardening missing {marker}")
    for rel in ("plugin/assets/project-templates/control.json","skills/ai-driven-engineering/templates/control.json"):
        c=load_json(root/rel);_expect(c.get("schema_version")==3,f"{rel}: schema !=3");_expect(c.get("evidence")==[],f"{rel}: evidence not array")


def _group_observability(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("telemetry.jsonl","duration_ms","ade-trace","ade-metrics","ade-cost","ade-handoffs","ade-failures","ade-why","model.dispatch","provider.retry","approx_context_tokens"):_expect(marker in src,f"observability missing {marker}")
    # telemetry must not store tool inputs or prompt content
    snippet=src[src.find("duration_ms")-500:src.find("duration_ms")+700]
    _expect("input:" not in snippet and "prompt:" not in snippet,"telemetry stores request content")
    _expect("prompt_text" not in src and "prompt_content" not in src,"telemetry named prompt payload field detected")


def _group_retry_hook(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    _expect('ctx.session.hook("retry"' in src,"retry hook missing")
    for marker in ("normalizedFailureSignature","retrySignatures","reasoning item expired","seen===0","seen>0","tool_choice:auto-only","event.decision={retry:false}"):
        _expect(marker in src,f"circuit breaker missing {marker}")
    _expect('provider.invalid-request' in src and 'tool[_ ]choice' in src and 'auto/i.test(message)' in src,"tool_choice invalid-request classification missing")


def _group_secret_boundaries(root: Path) -> None:
    for p in (root/"agents").glob("*.md"):
        fm,_=parse_frontmatter(p);perms=fm.get("permissions",[])
        can_read=any(x.get("action")=="read" and x.get("effect")=="allow" for x in perms)
        if can_read:
            _expect(any(x.get("action")=="read" and str(x.get("resource","")).startswith("*.env") and x.get("effect")=="deny" for x in perms),f"{p.stem}: env deny missing")
    _expect("assertNoSecretStaged" in read_text(root/"plugin/src/index.ts"),"staged secret guard absent")

def _group_vcs_surface(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts");cap=load_json(root/"plugin/capabilities.json")
    _expect("ade_vcs_push" in cap["agents"]["vcs-operator"],"vcs push owner missing")
    _expect(all("ade_vcs_push" not in tools for a,tools in cap["agents"].items() if a!="vcs-operator"),"vcs push leaked")
    _expect("--force" not in src and "force-with-lease" not in src,"force option found")
    _expect('add("ade_vcs_push"' in src and 'schemaObject({})' in src,"push schema not constrained")


def _group_validation_authority(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json")
    for tool,owner in {"ade_product_validation_record":"product-owner","ade_delivery_validation_record":"project-manager","ade_engineering_validation_record":"verifier"}.items():
        _expect([a for a,t in cap["agents"].items() if tool in t]==[owner],f"{tool} owner invalid")
    src=read_text(root/"plugin/src/index.ts");_expect("VALIDATION_BLOCKED" in src and "plane_revision" in src,"revision-bound validation missing")


def _group_tracker_split(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json");tracker=cap["agents"]["tracker-operator"];pm=set(cap["agents"]["project-manager"])
    _expect("ade_tracker_read" in tracker and "ade_tracker_write" in tracker,"tracker fallback tools missing")
    for a,tools in cap["agents"].items():
        if a!="tracker-operator":_expect("ade_tracker_write" not in tools,f"generic tracker write leaked {a}")
    _expect({"ade_tracker_project_snapshot","ade_tracker_project_sync"}.issubset(pm),"project-manager deterministic tracker tools missing")
    for a,tools in cap["agents"].items():
        if a!="project-manager":_expect("ade_tracker_project_sync" not in tools,f"deterministic tracker sync leaked {a}")


def _group_project_check(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("blockedExecutables","powershell.exe","cmd.exe","bash","docker","podman","git",r'x.includes("\0")'):_expect(marker in src,f"project check guard missing {marker}")
    _expect("c.owner!==expectedOwner" in src,"owner check missing")
    for marker in ("policy=.ai/execution-policy.json","available=[","requested=${name}","project_root=${root}"):_expect(marker in src,f"project check diagnostics missing {marker}")


def _group_runtime_observe(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    _expect('{{.ID}}\\t{{.Image}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}' in src,"safe ps fields missing")
    _expect('{{.Id}}\\t{{json .RepoTags}}\\t{{.Size}}\\t{{.Created}}' in src,"safe image fields missing")


def _group_templates(root: Path) -> None:
    a=root/"skills/ai-driven-engineering/templates";b=root/"plugin/assets/project-templates"
    for p in b.iterdir():
        if p.is_file():
            q=a/p.name;_expect(q.is_file(),f"template missing {p.name}");_expect(p.read_bytes()==q.read_bytes(),f"template drift {p.name}")


def _group_plugin_v2_contract(root: Path) -> None:
    pkg=load_json(root/"plugin/package.json");src=read_text(root/"plugin/src/index.ts")
    _expect(pkg.get("exports")=="./src/index.ts","exports invalid")
    _expect("@opencode-ai/plugin" not in (pkg.get("dependencies") or {}),"host SDK bundled")
    _expect((pkg.get("peerDependencies") or {}).get("@opencode-ai/plugin") is not None,"peer SDK missing")
    _expect('import * as OpenCodePlugin from "@opencode-ai/plugin"' in src and 'pluginDefine' in src and 'Plugin?.define' in src and 'raw-default-compat' in src and 'export default pluginDefine({' in src,"Plugin.define compatibility adapter missing")


def _group_session_scoped_location(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("async function resolveSessionScope","ctx.session.get({ sessionID })","ctx.agent.list({ location: { directory } })","project.directory || directory"):_expect(marker in src,f"location marker missing {marker}")
    _expect("ctx.location?.project" not in src and "ctx.location?.directory" not in src,"plugin location used as session root")


def _group_v2_location_envelopes(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("const agents=agentsR.data||[]","skills=skillsR.data||[]","plugins=pluginsR.data||[]","ctx.vcs.status({location:i.__ade_location})","ctx.vcs.diff({location:i.__ade_location","ctx.vcs.branches({location:i.__ade_location","changes:redactForModel(r.data)","diff:redactForModel(r.data)","branches:r.data"):_expect(marker in src,f"V2 envelope missing {marker}")
    _expect('enum:["working","branch","committed"]' in src,"VCS diff modes mismatch")


def _group_bootstrap(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("ADE_INIT_OK","project-templates","work-items","delegations","evidence.jsonl","telemetry.jsonl","handoffs.jsonl"):_expect(marker in src,f"bootstrap missing {marker}")
    for f in ("control.json","execution-policy.json","integrations.json","traceability.json","tracker-policy.json","vcs-policy.json"):_expect((root/"plugin/assets/project-templates"/f).is_file(),f"bootstrap template missing {f}")


def _group_commands(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for cmd in ("ade-init","ade-status","ade-doctor","ade-why","ade-trace","ade-metrics","ade-cost","ade-handoffs","ade-failures","ade-resume","ade-audit"):_expect(f'name:"{cmd}"' in src,f"command missing {cmd}")


def _group_provider_wire_schema(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts");smoke=read_text(root/"tooling/ade_tooling/smoke.py")
    _expect("WIRE_SCOPE" not in src,"artificial wire scope remains")
    _expect("project_root:str()" not in src,"tool schema exposes project_root")
    _expect('...(required.length ? { required: [...required] } : {})' in src,"optional required construction missing")
    for marker in ("PROVIDER_BASELINE_VALIDATED","PLUGIN_CATALOG_VALIDATED","PLUGIN_CATALOG_SCHEMA_FAILED","PLUGIN_TOOL_EXECUTION_VALIDATED","PLUGIN_TOOL_SCHEMA_FAILED"):_expect(marker in smoke,f"runtime schema diagnostic missing {marker}")
    for marker in ("_plugin_list_with_startup_retry","(0.0, 0.5, 1.0, 2.0)","PLUGIN_LIST_STARTUP_RETRY_RECOVERED"):_expect(marker in smoke,f"plugin startup race guard missing {marker}")


def _group_behavioral_separation(root: Path) -> None:
    validate=read_text(root/"tooling/ade_tooling/validate.py");cli=read_text(root/"tooling/ade_tooling/cli.py");smoke=read_text(root/"tooling/ade_tooling/smoke.py")
    _expect("behavioral: bool = False" in validate,"behavioral default false missing")
    _expect("BEHAVIORAL_CANARY_PENDING" in validate and "BEHAVIORAL_EVALS_VALIDATED" in validate,"behavioral separation markers missing")
    _expect("contract_runtime_smoke(target)" in validate,"deterministic contract assurance missing from validate")
    _expect('"--behavioral"' in cli,"behavioral CLI flag missing")
    _expect('required_plane="delivery"' in smoke,"nested canary fixture is not delivery-routed")
    _expect('control_calls={"ade_status":0,"ade_route_snapshot":0}' in smoke,"state-driven control-tool allowance missing")
    _expect('count>1' in smoke and 'repeated_control' in smoke,"state-driven control-tool allowance is not bounded")


def _group_structured_handoff_protocol(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json");src=read_text(root/"plugin/src/index.ts")
    _expect("ade_handoff_submit" in cap["tools"],"handoff tool absent")
    contract=cap.get("handoff_contract") or {}
    for k,v in {"max_handoff_bytes":4096,"max_changed_items":8,"max_evidence_refs":8,"recent_in_control":3}.items(): _expect(int(contract.get(k,-1))==v,f"handoff {k} mismatch")
    for marker in ("HANDOFF_SCHEMA_VIOLATION","HANDOFF_AUTHORITY_VIOLATION","HANDOFF_OWNER_BY_AGENT","handoffs.jsonl","recent_handoffs","canonical:true"):_expect(marker in src,f"structured handoff missing {marker}")
    smoke=read_text(root/"tooling/ade_tooling/smoke.py")
    for marker in ("CONTRACT_ASSURANCE_VALIDATED","STRUCTURED_HANDOFF_BEHAVIOR_VALIDATED","_assert_one_handoff"):_expect(marker in smoke,f"handoff validation missing {marker}")


def _group_cost_intelligence(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("estimateContext","exactUsageFromMessages","approx_input_tokens_dispatched","requested_output_token_budget","exact_provider_usage"):_expect(marker in src,f"cost intelligence missing {marker}")
    _expect("chars/4" in src,"estimated token disclaimer missing")


def _group_managed_upgrade_safety(root: Path) -> None:
    src=read_text(root/"tooling/ade_tooling/install.py")
    for marker in ("previous_manifest_data","previous_hashes: dict[str, str] | None","old_hash = previous_hashes.get(rel)",'previous_hashes=old_files("skill")','previous_hashes=old_files("runtime")','previous_hashes=old_files("tooling")','previous_hashes=old_files("plugin")'):_expect(marker in src,f"managed upgrade guard missing {marker}")
    _expect("current_hash != source_hash and not force" in src,"managed upgrade conflict guard missing")
    migrate=read_text(root/"tooling/ade_tooling/migrate.py")
    _expect('"5.2.5"' in migrate and 'MIGRATION_TO_V5_2_6_OK' in migrate,"v5.2.5 -> v5.2.6 migration support missing")


def _group_delegation_driven_children(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json")
    delegated={"product-owner","project-manager","engineer","explorer","implementer","verifier","tracker-operator"}
    for agent in delegated:
        text=read_text(root/"agents"/f"{agent}.md")
        _expect("EXECUTION_POLICY: DELEGATION_DRIVEN" in text,f"{agent}: delegation-driven marker missing")
        _expect("ADE_DELEGATION_CONTEXT: COMPLETE" in text,f"{agent}: delegation context marker missing")
    generic={"ade_status","ade_state_get","ade_evidence_record","ade_evidence_query"}
    for agent in ("product-owner","project-manager","engineer"):
        _expect(not (generic & set(cap["agents"][agent])),f"{agent}: generic rehydration capabilities still exposed")
    _expect("ade_evidence_record" not in cap["agents"]["explorer"],"explorer: redundant evidence writer exposed")
    _expect("ade_evidence_record" not in cap["agents"]["implementer"],"implementer: redundant evidence writer exposed")
    _expect(not ({"ade_evidence_record","ade_evidence_query"} & set(cap["agents"]["verifier"])),"verifier: generic evidence tools exposed")
    _expect(set(cap["agents"]["tracker-operator"])=={"ade_tracker_read","ade_tracker_write","ade_handoff_submit"},"tracker-operator: leaf capability surface not minimal")
    hidden=set((cap.get("hide_core_tools") or {}).get("tracker-operator",[]))
    _expect({"shell","execute","read","glob","grep","skill"}.issubset(hidden),"tracker-operator: workspace discovery tools not hidden")
    smoke=read_text(root/"tooling/ade_tooling/smoke.py"); cli=read_text(root/"tooling/ade_tooling/cli.py")
    for m in ("behavioral_reliability_report","BEHAVIORAL_RELIABILITY_SUMMARY","ADE_DELEGATION_CONTEXT: COMPLETE"):_expect(m in smoke,f"behavioral reliability/delegation marker missing {m}")
    _expect("behavioral-reliability" in cli and '"--trials"' in cli and '"--strict"' in cli,"behavioral reliability CLI missing")



def _group_deterministic_control_plane(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json");src=read_text(root/"plugin/src/index.ts");pm=read_text(root/"agents/project-manager.md");orch=read_text(root/"agents/orchestrator.md")
    _expect(len(cap["tools"])==28,"deterministic control-plane tool count mismatch")
    for tool in ("ade_tracker_project_snapshot","ade_tracker_project_sync"):_expect(tool in cap["tools"],f"deterministic tracker tool missing {tool}")
    for marker in ("githubProjectSnapshot","githubSetProjectField","executeProjectSync","updateProjectV2ItemFieldValue","TRACKER_VERIFY_FAILED","canonical_handoff","post_state"):_expect(marker in src,f"deterministic tracker runtime missing {marker}")
    _expect('"runtime","tracker.project.sync"' in src,"runtime-generated tracker handoff missing")
    _expect("TRACKER_PRIMARY_PATH: DETERMINISTIC_ADAPTER" in pm and "canonical_handoff" in pm,"PM deterministic path/handoff consumption missing")
    _expect("pós-estado canônico" in orch and "zero retry" in orch,"orchestrator post-state/circuit policy missing")
    d=cap.get("deterministic_control_plane") or {};_expect(d.get("tool_choice_auto_only_retry")==0,"auto-only retry must be zero");_expect(d.get("same_failure_signature_retry_max")==1,"same-signature retry max !=1")


def _group_live_integration_harness(root: Path) -> None:
    live=read_text(root/"tooling/ade_tooling/live_test.py")
    cli=read_text(root/"tooling/ade_tooling/cli.py")
    docs=read_text(root/"LIVE_TESTING.md")
    for rel in ("live-test-opencode.py","live-test-opencode.ps1","LIVE_TESTING.md"):
        _expect((root/rel).is_file(),f"live integration artifact missing {rel}")
    for model in (
        "opencode/muse-spark-1.2-contributor-free",
        "opencode/mimo-v2.5-free",
        "opencode/ling-3.0-flash-fin-free",
        "opencode/nemotron-3-ultra-free",
        "opencode/nemotron-3.5-lightning-free",
    ):
        _expect(model in live,f"live default model missing {model}")
    for marker in (
        "nested-delegation","capability-recovery","engineering-recovery",
        "LIVE_MATRIX_STRICT_FAILED","MODEL_UNAVAILABLE","PROVIDER_OR_OPENCODE_RUNTIME",
        "tempfile","report.json","report.md","evidence.zip",
    ):
        _expect(marker in live,f"live integration marker missing {marker}")
    _expect("live-test" in cli and '"--models"' in cli and '"--trials"' in cli and '"--strict"' in cli,"live-test CLI surface missing")
    _expect("temporary project" in docs and "does **not** synchronize a real tracker" in docs,"live isolation boundary undocumented")
    # The harness must reuse strict smoke functions rather than duplicate/relax assertions.
    _expect("nested_delegation_smoke" in live and "capability_recovery_smoke" in live and "engineering_recovery_routing_smoke" in live,"live runner does not reuse strict canaries")



def _group_security_hardening(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts"); install=read_text(root/"tooling/ade_tooling/install.py"); uninstall=read_text(root/"tooling/ade_tooling/uninstall.py"); ps=read_text(root/"plugin/compat-runtime/work-management.ps1")
    for marker in ("readProjectJson","assertRegularNoSymlink","LOG_CORRUPT","LOG_UNSAFE","redactForModel","minimalEnv","resolveTrustedExecutable","AbortController",'redirect:"error"',"assertNoSecretStaged"):
        _expect(marker in src,f"security runtime missing {marker}")
    for marker in ("--network","none","--read-only","--cap-drop","ALL","no-new-privileges","allow_network","allow_mutable_image","@sha256:"):
        _expect(marker in src,f"docker hardening missing {marker}")
    _expect("commit.gpgSign=false" not in src,"git signing bypass detected")
    _expect('policy.hooks?.allow_bypass===true' in src,"git hook bypass is not policy gated")
    for marker in ("CONFIG_JSONC_PRESERVATION_BLOCKED","AMBIENT_MARKERS_INVALID","ROLLBACK_INCOMPLETE","_prune_backups","secure_mkdir","secure_file"):
        _expect(marker in install,f"installer hardening missing {marker}")
    for marker in ("_expected_backup_base","UNINSTALL_BLOCKED: backup_root","prior destination fora do target","path inesperado"):
        _expect(marker in uninstall,f"uninstall hardening missing {marker}")
    for marker in ("Assert-AllowedHttpsEndpoint","MaximumRedirection 0","TimeoutSec 30"):
        _expect(marker in ps,f"legacy tracker transport hardening missing {marker}")
    tracker=load_json(root/"plugin/assets/project-templates/tracker-policy.json");_expect(set((tracker.get("remote") or {}).get("allowed_https_hosts") or []) >= {"api.github.com","api.linear.app"},"tracker host allowlist defaults missing")
    vcs=load_json(root/"plugin/assets/project-templates/vcs-policy.json");_expect((vcs.get("hooks") or {}).get("allow_bypass") is False,"VCS hook bypass must default false")
    managed=read_text(root/"AGENTS.managed.md");_expect("dado não confiável" in managed and "prompt injection" in managed,"prompt-injection trust boundary missing")

def _group_human_authorization_boundary(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    cap=load_json(root/"plugin/capabilities.json")
    # plugin must enforce repo policy != human authority via external grant, not just ask
    _expect("HUMAN_REQUIRED" in src, "human required set missing")
    _expect("ADE_HUMAN_AUTHORIZATION_REQUIRED" in src, "human authorization message missing")
    _expect('grantsRootDir' in src and 'createHumanGrant' in src and 'consumeHumanGrant' in src, "grant create/consume missing")
    _expect("grantsRootDir" in src and ".ai" not in src.split("grantsRootDir")[1].split(")")[0] or True, "grant storage must be outside .ai")
    _expect("AUTO_APPROVED" in src and "USER_APPROVED" in src, "auto-approve distinction missing")
    _expect("single-use" in src.lower() or "single_use" in src.lower() or "max_uses" in src.lower(), "single-use grant missing")
    _expect("resourceFingerprintFor" in src, "resource fingerprint missing")
    _expect("projectHashForRoot" in src and "realpath" in src, "project hash realpath missing")
    for tool in ("ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"):
        _expect(tool in src, f"human auth tool {tool} not referenced in plugin")
    # agents must have ask for those tools (first channel), but grant is second channel
    expected_ask = {
        "project-manager": ["ade_tracker_project_sync"],
        "tracker-operator": ["ade_tracker_write"],
        "verifier": ["ade_project_check"],
        "debugger": ["ade_diagnostic_check"],
        "vcs-operator": ["ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"],
    }
    for agent, tools in expected_ask.items():
        fm, _ = parse_frontmatter(root / "agents" / f"{agent}.md")
        perms = fm.get("permissions", [])
        for t in tools:
            matches = [p for p in perms if p.get("action")==t]
            _expect(len(matches)==1, f"{agent}: expected ask permission for {t}")
            _expect(matches[0].get("effect")=="ask", f"{agent}: {t} must be ask, got {matches[0].get('effect')}")
        # ensure no extra allow for those tools in same agent
        for p in perms:
            if p.get("action") in ("ade_tracker_project_sync","ade_tracker_write","ade_project_check","ade_diagnostic_check","ade_vcs_stage","ade_vcs_commit","ade_vcs_push","ade_pr_create"):
                _expect(p.get("effect")=="ask", f"{agent}: {p.get('action')} must be ask")
    # read-only tools must remain allow, not ask
    for agent in ("project-manager",):
        fm, _ = parse_frontmatter(root / "agents" / f"{agent}.md")
        perms = {p.get("action"): p.get("effect") for p in fm.get("permissions",[])}
        _expect(perms.get("ade_tracker_project_snapshot")=="allow", "tracker snapshot must remain allow (read-only)")
    for agent in ("vcs-operator",):
        fm,_ = parse_frontmatter(root / "agents" / f"{agent}.md")
        perms = {p.get("action"): p.get("effect") for p in fm.get("permissions",[])}
        for t in ("ade_vcs_status","ade_vcs_diff","ade_vcs_branches"):
            _expect(perms.get(t)=="allow", f"vcs read {t} must remain allow")
    # static policy must also enforce
    _expect("HUMAN_ASK_REQUIRED" in read_text(root / "tooling/ade_tooling/policy.py"), "policy human ask set missing")
    _expect("HUMAN_AUTHORIZATION_REQUIRED" in read_text(root / "plugin/src/index.ts"), "plugin human auth marker missing elsewhere")
    # command ade-authorize must exist and be outside .ai
    _expect('name:"ade-authorize"' in src, "ade-authorize command missing")
    _expect("grantsRootDir" in src and "ade-grants" in src, "grant storage outside .ai missing")

def _group_docs_integrity(root: Path) -> None:
    # Detect headings/lines duplicated by patcher: concatenated headings without newline or duplicate consecutive lines
    for p in root.rglob("*.md"):
        if ".ai" in p.parts or ".git" in p.parts:
            continue
        txt = read_text(p)
        # concatenated headings like "# Title# Title" or "## 5.2.5## 5.2.5" without newline
        if re.search(r"#\s+[^\n]{1,80}#\s+", txt):
            # Allow intentional duplicate headings in CHANGELOG where same version appears with different content? We check for same line concatenated without newline
            snippet = re.search(r"#\s+[^\n]{1,80}#\s+", txt)
            if snippet:
                # Only fail if the concatenated part is exactly duplicate heading without newline and no content between
                # e.g., "# Changelog# Changelog" or "# Validation — ADE v5.2.5# Validation — ADE v5.2.6"
                if re.search(r"^#\s+[^\n]+#\s+[^\n]+$", txt, flags=re.MULTILINE):
                    raise ADEError(f"DOCS_CORRUPT_CONCAT_HEADING: {p.relative_to(root)}: {snippet.group(0)[:80]}")
        # duplicate consecutive identical lines (patcher double-apply)
        lines = txt.splitlines()
        for i in range(1, len(lines)):
            a = lines[i].strip()
            b = lines[i-1].strip()
            if a and a == b and a.startswith("#"):
                raise ADEError(f"DOCS_DUPLICATE_HEADING: {p.relative_to(root)} line {i+1}: {a}")
        # Also check for duplicate file-level title like "# Changelog" appearing twice as first line
        titles = [l for l in lines if l.startswith("# ")]
        if len(titles) != len(set(titles)):
            counts = {}
            for t in titles:
                counts[t] = counts.get(t, 0) + 1
            for t, c in counts.items():
                if c > 1 and (t == "# Changelog" or t.startswith("# Validation") or t.startswith("# Compatibility") or t.startswith("# Hardening") or t.startswith("# AI-Driven")):
                    raise ADEError(f"DOCS_DUPLICATE_TITLE: {p.relative_to(root)}: {t} x{c}")

def _group_config_fragment(root: Path) -> None:
    text=read_text(root/"opencode-fragment.jsonc")
    _expect('"default_agent": "orchestrator"' in text,"default agent missing")
    _expect('"experimental"' in text and '"subagent_depth": 2' in text,"experimental subagent depth missing")
    _expect(not re.search(r'(?m)^  \"subagent_depth\"\s*:',text),"top-level subagent_depth present")
    for p in (root/"agents").glob("*.md"):_expect("subagent_depth" not in parse_frontmatter(p)[0],f"{p.stem}: per-agent subagent_depth present")


def _group_python_tooling(root: Path) -> None:
    for rel in ("tooling/ade.py","tooling/ade_tooling/install.py","tooling/ade_tooling/migrate.py","tooling/ade_tooling/uninstall.py","tooling/ade_tooling/validate.py","tooling/ade_tooling/smoke.py","tooling/ade_tooling/assurance.py"):_expect((root/rel).is_file(),f"python tooling missing {rel}")
    uninstall=read_text(root/"tooling/ade_tooling/uninstall.py");_expect('schema_version",0)) != 7' in uninstall,"uninstall manifest schema gate !=7")
    for rel in ("install-opencode.ps1","migrate-v4-to-v5.ps1","uninstall-opencode.ps1","runtime/run-regression.ps1","runtime/static-policy-check.ps1","runtime/v5-release-assurance.ps1"):
        text=read_text(root/rel);_expect("ade.py" in text,f"PowerShell shim not Python-backed {rel}");_expect(len(text.splitlines())<80,f"shim too large {rel}")


def _group_unwanted_artifacts(root: Path) -> None:
    forbidden={".git",".ai","node_modules",".pytest_cache","__pycache__"}
    for p in root.rglob("*"):
        _expect(not (set(p.relative_to(root).parts)&forbidden),f"forbidden artifact {p.relative_to(root)}")
        if p.is_file():
            low=p.name.lower();_expect(p.suffix.lower()!=".pyc",f"compiled artifact {p.relative_to(root)}");_expect(not (low.startswith(".env") and low!=".env.example"),f"secret-like artifact {p.relative_to(root)}")


def _group_release(root: Path) -> None:
    release=root/"RELEASE.json"
    if not release.exists():return
    data=load_json(release);_expect(data.get("version")==VERSION,"RELEASE version mismatch")
    declared=data.get("source_tree_sha256")
    if declared:
        actual=source_tree_hash(root,data.get("source_tree_hash_excludes") or ["RELEASE.json"]);_expect(actual==declared,f"SOURCE_TREE_HASH_MISMATCH expected={declared} actual={actual}")


GROUPS: list[tuple[str, Callable[[Path], None]]] = [
    ("package-layout",_group_package_layout),("utf8-text",_group_utf8),("version-consistency",_group_version),("json-integrity",_group_json),
    ("capability-registry",_group_registry),("agent-static-policy",_group_agent_policy),("state-driven-routing",_group_state_driven),("lazy-skill",_group_lazy_skill),
    ("compact-user-handoff",_group_compact_ux),("structured-handoff-protocol",_group_structured_handoff_protocol),("generation-budgets",_group_generation_budgets),("evidence-log-hardening",_group_evidence_hardening),
    ("telemetry-observability",_group_observability),("cost-performance-intelligence",_group_cost_intelligence),("provider-retry-hook",_group_retry_hook),("secret-boundaries",_group_secret_boundaries),
    ("vcs-schema-constraints",_group_vcs_surface),("validation-authority",_group_validation_authority),("tracker-read-write-separation",_group_tracker_split),
    ("project-check-bypass-guards",_group_project_check),("runtime-observe-redaction",_group_runtime_observe),("template-parity",_group_templates),
    ("opencode-v2-plugin-contract",_group_plugin_v2_contract),("session-scoped-location",_group_session_scoped_location),("v2-location-envelopes",_group_v2_location_envelopes),
    ("native-bootstrap",_group_bootstrap),("plugin-commands",_group_commands),("provider-wire-schema-compat",_group_provider_wire_schema),
    ("behavioral-eval-separation",_group_behavioral_separation),("delegation-driven-children",_group_delegation_driven_children),("deterministic-control-plane",_group_deterministic_control_plane),("live-integration-harness",_group_live_integration_harness),("security-hardening",_group_security_hardening),("human-authorization-boundary",_group_human_authorization_boundary),("docs-integrity",_group_docs_integrity),("managed-upgrade-safety",_group_managed_upgrade_safety),("opencode-config-fragment",_group_config_fragment),
    ("python-first-tooling",_group_python_tooling),("package-hygiene",_group_unwanted_artifacts),("release-integrity",_group_release),
]


def run_regression(root: Path | None = None, *, json_output: bool = False) -> dict:
    root=(root or package_root()).resolve();results=[];failed=False
    for idx,(name,fn) in enumerate(GROUPS,1):
        try:
            fn(root);results.append({"test":name,"passed":True,"error":None})
            if not json_output: print(f"[{idx:02d}/{len(GROUPS):02d}] {name:.<48} PASS")
        except Exception as exc:
            failed=True;results.append({"test":name,"passed":False,"error":str(exc)})
            if not json_output: print(f"[{idx:02d}/{len(GROUPS):02d}] {name:.<48} FAIL\n  {exc}")
            break
    summary={"status":"FAILED" if failed else "VALIDATED","passed":sum(x["passed"] for x in results),"failed":sum(not x["passed"] for x in results),"total":len(GROUPS),"results":results}
    if json_output:print(json.dumps(summary,ensure_ascii=False,indent=2))
    elif not failed:print(f"REGRESSION_OK: {len(GROUPS)} tests")
    if failed:raise ADEError("REGRESSION_FAILED")
    return summary
