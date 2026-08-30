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
        "tooling/ade_tooling/install.py","tooling/ade_tooling/smoke.py","tooling/ade_tooling/regression.py",
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
    _expect(len(cap["tools"])==26,"typed tools != 26")
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
    for marker in ("telemetry.jsonl","duration_ms","ade-trace","ade-metrics","ade-cost","ade-handoffs","ade-why","model.dispatch","provider.retry","approx_context_tokens"):_expect(marker in src,f"observability missing {marker}")
    # telemetry must not store tool inputs or prompt content
    snippet=src[src.find("duration_ms")-500:src.find("duration_ms")+700]
    _expect("input:" not in snippet and "prompt:" not in snippet,"telemetry stores request content")
    _expect("prompt_text" not in src and "prompt_content" not in src,"telemetry named prompt payload field detected")


def _group_retry_hook(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    _expect('ctx.session.hook("retry"' in src,"retry hook missing")
    _expect('Number(event.attempt||0)<3' in src,"retry is not bounded")
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
    cap=load_json(root/"plugin/capabilities.json");tracker=cap["agents"]["tracker-operator"]
    _expect("ade_tracker_read" in tracker and "ade_tracker_write" in tracker,"tracker tools missing")
    for a,t in cap["agents"].items():
        if a!="tracker-operator":_expect("ade_tracker_write" not in t,f"tracker write leaked {a}")


def _group_project_check(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("blockedExecutables","powershell.exe","cmd.exe","bash","docker","podman","git",'args.some((x:string)=>x.includes("\\0"))'):_expect(marker in src,f"project check guard missing {marker}")
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
    for marker in ("const agents=agentsR.data||[]","skills=skillsR.data||[]","plugins=pluginsR.data||[]","ctx.vcs.status({location:i.__ade_location})","ctx.vcs.diff({location:i.__ade_location","ctx.vcs.branches({location:i.__ade_location","changes:r.data","diff:r.data","branches:r.data"):_expect(marker in src,f"V2 envelope missing {marker}")
    _expect('enum:["working","branch","committed"]' in src,"VCS diff modes mismatch")


def _group_bootstrap(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("ADE_INIT_OK","project-templates","work-items","delegations","evidence.jsonl","telemetry.jsonl","handoffs.jsonl"):_expect(marker in src,f"bootstrap missing {marker}")
    for f in ("control.json","execution-policy.json","integrations.json","traceability.json","tracker-policy.json","vcs-policy.json"):_expect((root/"plugin/assets/project-templates"/f).is_file(),f"bootstrap template missing {f}")


def _group_commands(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for cmd in ("ade-init","ade-status","ade-doctor","ade-why","ade-trace","ade-metrics","ade-cost","ade-handoffs","ade-resume","ade-audit"):_expect(f'name:"{cmd}"' in src,f"command missing {cmd}")


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
    _expect('"5.2.1"' in migrate and 'MIGRATION_TO_V5_2_2_OK' in migrate,"v5.2.1 -> v5.2.2 migration support missing")


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
    ("behavioral-eval-separation",_group_behavioral_separation),("managed-upgrade-safety",_group_managed_upgrade_safety),("opencode-config-fragment",_group_config_fragment),
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
