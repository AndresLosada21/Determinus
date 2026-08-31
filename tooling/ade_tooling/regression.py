from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

from .common import ADEError, AGENTS, VERSION, load_json, package_root, parse_frontmatter, read_text, source_tree_hash

ACTIVE = {"orchestrator","explorer","implementer","verifier","reviewer"}


def _expect(cond: bool, message: str) -> None:
    if not cond:
        raise ADEError(message)


def _group_package_layout(root: Path) -> None:
    required = [
        "VERSION","README.md","CHANGELOG.md","COMPATIBILITY.md","HARDENING.md","DURABLE_KERNEL.md",
        "RELEASE_NOTES_v6.0.0.md","RELEASE_NOTES_v6.0.1.md","RELEASE_NOTES_v6.0.2.md","RELEASE_NOTES_v6.0.3.md","RELEASE_NOTES_v6.0.4.md","RELEASE_NOTES_v6.0.5.md","MIGRATION_v5.2.8_to_v6.0.0.md","MIGRATION_v5.2.8_to_v6.0.1.md","MIGRATION_v6.0.0_to_v6.0.1.md","MIGRATION_v6.0.1_to_v6.0.2.md","MIGRATION_v6.0.2_to_v6.0.3.md","MIGRATION_v6.0.3_to_v6.0.4.md","MIGRATION_v6.0.4_to_v6.0.5.md","VALIDATION.md","VALIDATION_REPORT.md",
        "AGENTS.managed.md","opencode-fragment.jsonc","plugin/package.json","plugin/capabilities.json","plugin/src/index.ts",
        "tooling/ade.py","tooling/ade_tooling/common.py","tooling/ade_tooling/install.py","tooling/ade_tooling/migrate.py",
        "tooling/ade_tooling/uninstall.py","tooling/ade_tooling/validate.py","tooling/ade_tooling/smoke.py","tooling/ade_tooling/assurance.py",
        "build-release.py","install-opencode.py","migrate-v4-to-v5.py","migrate-v6.0.0-to-v6.0.1.py","migrate-v6.0.0-to-v6.0.1.ps1","migrate-v6.0.1-to-v6.0.2.py","migrate-v6.0.1-to-v6.0.2.ps1","migrate-v6.0.2-to-v6.0.3.py","migrate-v6.0.2-to-v6.0.3.ps1","migrate-v6.0.3-to-v6.0.4.py","migrate-v6.0.3-to-v6.0.4.ps1","migrate-v6.0.4-to-v6.0.5.py","migrate-v6.0.4-to-v6.0.5.ps1","uninstall-opencode.py","validate-opencode.py",
    ]
    for rel in required:_expect((root/rel).is_file(),f"PACKAGE_LAYOUT_MISSING: {rel}")
    _expect(len(list((root/"agents").glob("*.md")))==18,"PACKAGE_LAYOUT_AGENT_FILES_MUST_BE_18_FOR_ROLLBACK_COMPAT")


def _group_utf8(root: Path) -> None:
    for p in root.rglob("*"):
        if not p.is_file() or any(x in p.parts for x in ("node_modules",".git",".ai","__pycache__")):continue
        if p.suffix.lower() in {".zip",".png",".jpg",".jpeg",".webp",".pdf"}:continue
        try:p.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:raise ADEError(f"UTF8_INVALID: {p.relative_to(root)}: {exc}") from exc


def _group_version(root: Path) -> None:
    _expect(read_text(root/"VERSION").strip()==VERSION,"VERSION_FILE_MISMATCH")
    _expect(load_json(root/"plugin/package.json").get("version")==VERSION,"PLUGIN_PACKAGE_VERSION_MISMATCH")
    _expect(load_json(root/"plugin/capabilities.json").get("version")==VERSION,"CAPABILITIES_VERSION_MISMATCH")
    _expect(f'__version__ = "{VERSION}"' in read_text(root/"tooling/ade_tooling/__init__.py"),"PY_TOOLING_VERSION_MISMATCH")
    _expect(f'VERSION = "{VERSION}"' in read_text(root/"tooling/ade_tooling/common.py"),"COMMON_VERSION_MISMATCH")


def _group_json(root: Path) -> None:
    for p in root.rglob("*.json"):
        if any(x in p.parts for x in ("node_modules",".git",".ai")):continue
        try:json.loads(read_text(p))
        except Exception as exc:raise ADEError(f"JSON_INVALID: {p.relative_to(root)}: {exc}") from exc


def _group_active_agents(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json")
    _expect(set(cap.get("agents",{}))==ACTIVE,"V6_ACTIVE_AGENT_SET_INVALID")
    disabled=set(AGENTS)-ACTIVE
    for name in disabled:
        fm,body=parse_frontmatter(root/"agents"/f"{name}.md")
        _expect(str(fm.get("disabled")).lower() == "true",f"{name}: legacy role must be disabled")
        _expect("durable kernel" in body.lower(),f"{name}: tombstone explanation missing")
    for name in ACTIVE:
        fm,_=parse_frontmatter(root/"agents"/f"{name}.md")
        if name!="orchestrator":_expect(str(fm.get("hidden")).lower() == "true",f"{name}: worker must be hidden")


def _group_registry(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json");src=read_text(root/"plugin/src/index.ts")
    _expect(len(cap.get("tools",{}))==34,f"V6_TOOL_COUNT_INVALID: {len(cap.get('tools',{}))}")
    registered=set(re.findall(r'\badd\("(ade_[A-Za-z0-9_]+)"',src))
    _expect(registered==set(cap["tools"]),f"TOOL_REGISTRY_DRIFT missing={sorted(set(cap['tools'])-registered)} extra={sorted(registered-set(cap['tools']))}")
    for tool in ("ade_workflow_start","ade_workflow_run","ade_workflow_snapshot","ade_workflow_cancel","ade_kernel_reconcile","ade_kernel_events"):_expect(tool in cap["tools"],f"V6_KERNEL_TOOL_MISSING: {tool}")


def _group_static_policy(root: Path) -> None:
    from .policy import static_policy
    static_policy(root)


def _group_durable_kernel(root: Path) -> None:
    cap=load_json(root/"plugin/capabilities.json");src=read_text(root/"plugin/src/index.ts");dk=cap.get("durable_kernel") or {}
    _expect((cap.get("deterministic_control_plane") or {}).get("architecture")=="DURABLE_KERNEL","DURABLE_KERNEL_ARCH_MISSING")
    _expect(dk.get("runtime")=="file_backed_event_sourcing","DURABLE_KERNEL_BACKEND_MISSING")
    for marker in ("KERNEL_SCHEMA_VERSION","kernelEnsureInitialized","kernelStartWorkflow","kernelRunWorkflow","kernelFinalizeAfterJob","kernelContextCapsule"):_expect(marker in src,f"DURABLE_KERNEL_CODE_MISSING: {marker}")


def _group_event_journal(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("events.jsonl","snapshot.json","prev_hash","event_hash","kernelEventHashMaterial","kernelReadEvents","kernelAppendDrafts","KERNEL_EVENT_MAX_BYTES"):_expect(marker in src,f"EVENT_JOURNAL_MISSING: {marker}")
    _expect("ADE_KERNEL_CORRUPT" in src and "SAFE_READ_ONLY" in src,"CORRUPT_JOURNAL_SAFE_MODE_MISSING")


def _group_scheduler(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts");cap=load_json(root/"plugin/capabilities.json")
    for marker in ("ctx.session.create","ctx.session.switchAgent","ctx.session.prompt","ctx.session.wait","ctx.session.context"):_expect(marker in src,f"SCHEDULER_PRIMITIVE_MISSING: {marker}")
    _expect("ade_delegate" not in cap["tools"],"LEGACY_DELEGATION_SURFACE_PRESENT")
    _expect("managedDelegateExecute" not in src and "DELEGATION_DAG" not in src,"LEGACY_DELEGATION_IMPLEMENTATION_PRESENT")
    _expect("worker_to_worker_delegation" in json.dumps(cap),"WORKER_DELEGATION_POLICY_MISSING")


def _group_workflow_state_machine(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts");cap=load_json(root/"plugin/capabilities.json")
    for kind in ("analysis","engineering","implementation_proposal","tracker_sync"):_expect(kind in (cap.get("durable_kernel") or {}).get("workflow_kinds",[]),f"WORKFLOW_KIND_MISSING: {kind}")
    for status in ("WAITING_APPROVAL","BLOCKED","RESULT_PROPOSED","DONE"):_expect(status in src,f"WORKFLOW_STATUS_MISSING: {status}")
    _expect("ADE_WORKFLOW_VERIFICATION_REQUIRED" in src,"ENGINEERING_VERIFICATION_GATE_MISSING")


def _group_verification_resume(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts");test=read_text(root/"plugin/tests/durable-kernel.test.mjs")
    for marker in ("check_results","completed.has(name)","WAITING_APPROVAL","verification resumed from persisted worker result"):_expect(marker in src,f"VERIFICATION_RESUME_CODE_MISSING: {marker}")
    _expect("verification resumes from persisted check progress" in test,"VERIFICATION_RESUME_FUNCTIONAL_TEST_MISSING")
    _expect("must not rerun Verifier LLM" in test,"VERIFIER_RESPAWN_GUARD_TEST_MISSING")


def _group_leases_reconcile(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("KERNEL_JOB_LEASE_MS","KERNEL_JOB_MAX_ATTEMPTS","lease_expires_at","kernelReconcile","WORKER_LEASE_EXPIRED","ctx.session.interrupt"):_expect(marker in src,f"LEASE_RECONCILE_MISSING: {marker}")


def _group_mutation_serialization(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    _expect("mutation.lock" in src,"MUTATION_LOCK_MISSING")
    _expect("ADE_KERNEL_DIRTY_WORKTREE" in src,"DIRTY_BASELINE_FAIL_CLOSED_MISSING")
    _expect("withFileLock(kp.mutationLock" in src,"BUILDER_SERIALIZATION_MISSING")


def _group_authorization(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("EXPLICIT_EXTERNAL_GRANT","consumeHumanGrant","assertAuthorizationUnchanged","ADE_HUMAN_AUTHORIZATION_REQUIRED","ADE_AUTHORIZATION_STALE","resourceFingerprintFor"):_expect(marker in src,f"EXACT_EFFECT_AUTH_MISSING: {marker}")
    for marker in ("body_sha256","staged_diff_sha256","tree_sha","head_sha","definition_sha256"):_expect(marker in src,f"AUTH_FINGERPRINT_BINDING_MISSING: {marker}")


def _group_grant_store(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("grantsRootDir","assertGrantStoreSafeForProject","ADE_GRANT_STORE_UNSAFE","ADE_GRANT_STORE_CORRUPT","resourceTouchesGrantStore"):_expect(marker in src,f"GRANT_STORE_HARDENING_MISSING: {marker}")


def _group_provider_compat(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts");test=read_text(root/"plugin/tests/provider-compat.test.mjs")
    _expect('ctx.session.hook("http.request"' in src,"HTTP_REQUEST_PROVIDER_SHIM_MISSING")
    _expect("auto_only_tool_choice_models" in json.dumps(load_json(root/"plugin/capabilities.json")),"AUTO_ONLY_MODEL_REGISTRY_MISSING")
    for marker in ("required tool_choice is normalized to auto","none preserves no-tools semantics","unknown provider/model request is never rewritten","ChatGPT Codex Responses omits incompatible max_output_tokens","public OpenAI API keeps max_output_tokens budget intact"):_expect(marker in test,f"PROVIDER_COMPAT_TEST_MISSING: {marker}")
    for marker in ("chatgpt.com","/backend-api/codex/responses","max_output_tokens","provider.compat.codex_output_budget"):_expect(marker in src,f"OPENAI_CODEX_COMPAT_MISSING: {marker}")


def _group_retry(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    _expect('ctx.session.hook("retry"' in src,"RETRY_HOOK_MISSING")
    for marker in ("normalizedFailureSignature","retrySignatures","tool_choice:auto-only","reasoning item expired","seen===0","seen>0"):_expect(marker in src,f"CIRCUIT_BREAKER_MISSING: {marker}")


def _group_secrets(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("redactSensitiveText","redactForModel","assertNoSecretOutbound","assertNoSecretStaged","PRIVATE KEY","github_pat_","glpat-"):_expect(marker in src,f"SECRET_BOUNDARY_MISSING: {marker}")


def _group_vcs(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    _expect("commit.gpgSign=false" not in src,"COMMIT_SIGNING_DISABLED")
    _expect("force-with-lease" not in src and '"--force"' not in src,"FORCE_PUSH_SURFACE")
    for marker in ("--literal-pathspecs","allowed_remote_urls","ls-remote","remoteSha","assertNoSecretStaged","policy.hooks?.allow_bypass===true"):_expect(marker in src,f"VCS_HARDENING_MISSING: {marker}")


def _group_process_docker(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("minimalEnv","blockedExecutables","allow_host_process","--network","--read-only","--cap-drop","ALL","no-new-privileges","--pids-limit","allow_mutable_image","allow_network"):_expect(marker in src,f"PROCESS_DOCKER_HARDENING_MISSING: {marker}")


def _group_tracker(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for marker in ("updateProjectV2ItemFieldValue","TRACKER_VERIFY_FAILED","githubProjectSnapshot","executeProjectSync","tracker_sync"):_expect(marker in src,f"TRACKER_ACTIVITY_MISSING: {marker}")
    _expect("ade_tracker_project_snapshot" in load_json(root/"plugin/capabilities.json")["agents"]["orchestrator"],"ORCHESTRATOR_TRACKER_SNAPSHOT_MISSING")
    _expect("ade_tracker_project_sync" not in load_json(root/"plugin/capabilities.json")["agents"]["orchestrator"],"ORCHESTRATOR_DIRECT_TRACKER_MUTATION_LEAK")


def _group_commands(root: Path) -> None:
    src=read_text(root/"plugin/src/index.ts")
    for name in ("ade-init","ade-status","ade-workflow","ade-why","ade-resume","ade-authorize"):_expect(f'name:"{name}"' in src,f"COMMAND_MISSING: /{name}")
    _expect("WORKFLOW_STARTED" in src and "next_action" in src and "ade_workflow_start only" in src,"WORKFLOW_START_UX_CONTRACT_MISSING")
    _expect("Resume the active ADE v6 durable workflow" in src,"V6_RESUME_COMMAND_NOT_KERNELIZED")


def _group_skill(root: Path) -> None:
    skill=read_text(root/"skills/ai-driven-engineering/SKILL.md")
    _expect('opencode/autoinvoke: "false"' in skill,"SKILL_AUTOINVOKE_MUST_BE_FALSE")
    _expect("Durable" in skill or "durable" in skill,"V6_SKILL_NOT_UPDATED")


def _group_config(root: Path) -> None:
    text=read_text(root/"opencode-fragment.jsonc")
    _expect('"default_agent": "orchestrator"' in text,"DEFAULT_AGENT_MISSING")
    _expect('"subagent_depth": 1' in text,"V6_SUBAGENT_DEPTH_MUST_BE_1")
    _expect(not re.search(r'(?m)^  "subagent_depth"\s*:',text),"TOP_LEVEL_SUBAGENT_DEPTH_PRESENT")


def _group_installer(root: Path) -> None:
    text=read_text(root/"tooling/ade_tooling/install.py")
    for marker in ("AI-DRIVEN-ENGINEERING:BEGIN v6","INSTALL_V6_0_5_OK","Plugin tools: 34"):_expect(marker in text,f"V6_INSTALLER_MARKER_MISSING: {marker}")
    _expect("LEGACY_BEGIN" in text and "BEGIN" in text,"V5_TO_V6_AMBIENT_REPLACEMENT_MISSING")
    from .install import _config_candidate
    merged=_config_candidate({"plugins":["vendor-plugin"]},default_agent=True)
    _expect(merged.get("plugins")==["vendor-plugin","./plugins/ai-driven-engineering"],"PLUGIN_REGISTRATION_MERGE_INVALID")
    deduped=_config_candidate({"plugins":["./plugins/ai-driven-engineering"]},default_agent=False)
    _expect(deduped.get("plugins")==["./plugins/ai-driven-engineering"],"PLUGIN_REGISTRATION_DUPLICATED")
    try:_config_candidate({"plugins":"invalid"},default_agent=False)
    except ADEError:pass
    else:raise ADEError("PLUGIN_REGISTRATION_INVALID_TYPE_ACCEPTED")
    _expect((root/"plugin/index.ts").is_file(),"PLUGIN_ROOT_ENTRYPOINT_MISSING")
    _expect('export { default } from "./src/index.ts"' in read_text(root/"plugin/index.ts"),"PLUGIN_ROOT_ENTRYPOINT_INVALID")


def _group_migration(root: Path) -> None:
    text=read_text(root/"tooling/ade_tooling/migrate.py")
    _expect('"5.2.8"' in text,"V5_2_8_DIRECT_MIGRATION_MISSING")
    _expect('"6.0.0"' in text,"V6_0_0_PATCH_MIGRATION_MISSING")
    _expect('"6.0.1"' in text,"V6_0_1_PATCH_MIGRATION_MISSING")
    _expect('"6.0.2"' in text,"V6_0_2_PATCH_MIGRATION_MISSING")
    _expect('"6.0.4"' in text,"V6_0_4_PATCH_MIGRATION_MISSING")
    _expect("MIGRATION_TO_V6_0_5_OK" in text,"V6_MIGRATION_SUCCESS_MARKER_MISSING")


def _group_manifest(root: Path) -> None:
    text=read_text(root/"tooling/ade_tooling/manifest.py")
    _expect("active_agents=5" in text,"MANIFEST_ACTIVE_AGENT_REPORT_MISSING")
    _expect("tools=34" in text,"MANIFEST_TOOL_REPORT_MISSING")


def _group_validation(root: Path) -> None:
    val=read_text(root/"tooling/ade_tooling/validate.py");smoke=read_text(root/"tooling/ade_tooling/smoke.py")
    _expect("ADE_V6_RUNTIME_CORE_VALIDATED" in val,"V6_RUNTIME_VALIDATION_MARKER_MISSING")
    _expect("DURABLE_KERNEL" in smoke,"V6_SMOKE_KERNEL_CHECK_MISSING")
    _expect("active_agents=5" in smoke,"V6_SMOKE_ACTIVE_AGENT_CHECK_MISSING")


def _group_node_tests(root: Path) -> None:
    tests="\n".join(read_text(p) for p in (root/"plugin/tests").glob("*.test.mjs"))
    for marker in ("analysis workflow is event-sourced","tampered journal forces SAFE_READ_ONLY","verification resumes from persisted check progress","tracker_sync workflow stops at WAITING_APPROVAL","workers cannot access kernel store"):_expect(marker in tests,f"V6_FUNCTIONAL_TEST_MISSING: {marker}")


def _group_docs(root: Path) -> None:
    for rel in ("README.md","DURABLE_KERNEL.md","RELEASE_NOTES_v6.0.1.md","RELEASE_NOTES_v6.0.2.md","RELEASE_NOTES_v6.0.3.md","RELEASE_NOTES_v6.0.4.md","MIGRATION_v6.0.0_to_v6.0.1.md","MIGRATION_v6.0.1_to_v6.0.2.md","MIGRATION_v6.0.2_to_v6.0.3.md","MIGRATION_v6.0.3_to_v6.0.4.md","MIGRATION_v5.2.8_to_v6.0.1.md","VALIDATION.md","HARDENING.md"):
        text=read_text(root/rel);_expect("6.0.1" in text or "v6" in text.lower(),f"V6_DOC_NOT_UPDATED: {rel}")
    _expect("agents are workers" in read_text(root/"DURABLE_KERNEL.md").lower() or "workers" in read_text(root/"DURABLE_KERNEL.md").lower(),"DURABLE_KERNEL_WORKER_MODEL_UNDOCUMENTED")


def _group_docs_integrity(root: Path) -> None:
    for p in root.rglob("*.md"):
        if any(x in p.parts for x in (".git",".ai","node_modules")):continue
        lines=read_text(p).splitlines()
        for i in range(1,len(lines)):
            if lines[i].strip() and lines[i].strip()==lines[i-1].strip() and lines[i].lstrip().startswith("#"):
                raise ADEError(f"DOCS_DUPLICATE_HEADING: {p.relative_to(root)}:{i+1}")
        for line in lines:
            if re.match(r'^#{1,6}\s+.+#{1,6}\s+.+$',line):raise ADEError(f"DOCS_CONCAT_HEADING: {p.relative_to(root)}: {line[:120]}")


def _group_wrappers(root: Path) -> None:
    for rel in ("install-opencode.ps1","migrate-v4-to-v5.ps1","uninstall-opencode.ps1","validate-opencode.ps1","runtime/run-regression.ps1","runtime/static-policy-check.ps1"):
        text=read_text(root/rel);_expect("ade.py" in text,f"WRAPPER_NOT_PYTHON_BACKED: {rel}")


def _group_hygiene(root: Path) -> None:
    forbidden={".git",".ai","node_modules",".pytest_cache","__pycache__"}
    for p in root.rglob("*"):
        rel=p.relative_to(root)
        _expect(not (set(rel.parts)&forbidden),f"FORBIDDEN_ARTIFACT: {rel}")
        if p.is_file():
            _expect(p.suffix.lower()!=".pyc",f"COMPILED_ARTIFACT: {rel}")
            low=p.name.lower();_expect(not (low.startswith(".env") and low!=".env.example"),f"SECRET_LIKE_ARTIFACT: {rel}")


def _group_release(root: Path) -> None:
    p=root/"RELEASE.json";_expect(p.is_file(),"RELEASE_JSON_MISSING")
    data=load_json(p);_expect(data.get("version")==VERSION,"RELEASE_VERSION_MISMATCH")
    declared=data.get("source_tree_sha256");_expect(bool(declared),"RELEASE_SOURCE_HASH_MISSING")
    actual=source_tree_hash(root,data.get("source_tree_hash_excludes") or ["RELEASE.json"]);_expect(actual==declared,f"SOURCE_TREE_HASH_MISMATCH expected={declared} actual={actual}")


GROUPS: list[tuple[str, Callable[[Path], None]]] = [
    ("package-layout",_group_package_layout),("utf8-text",_group_utf8),("version-consistency",_group_version),("json-integrity",_group_json),
    ("active-worker-model",_group_active_agents),("capability-registry",_group_registry),("static-policy",_group_static_policy),
    ("durable-kernel",_group_durable_kernel),("hash-chained-event-journal",_group_event_journal),("kernel-owned-scheduler",_group_scheduler),
    ("workflow-state-machine",_group_workflow_state_machine),("verification-resume",_group_verification_resume),("leases-reconciliation",_group_leases_reconcile),
    ("mutation-serialization",_group_mutation_serialization),("exact-effect-authorization",_group_authorization),("grant-store-isolation",_group_grant_store),
    ("provider-wire-compat",_group_provider_compat),("provider-circuit-breaker",_group_retry),("secret-boundaries",_group_secrets),
    ("vcs-hardening",_group_vcs),("process-docker-hardening",_group_process_docker),("tracker-deterministic-activity",_group_tracker),
    ("v6-commands",_group_commands),("skill-reference-only",_group_skill),("opencode-config",_group_config),("v6-installer",_group_installer),
    ("v5-to-v6-migration",_group_migration),("manifest-reporting",_group_manifest),("runtime-validation",_group_validation),
    ("functional-node-coverage",_group_node_tests),("v6-docs",_group_docs),("docs-integrity",_group_docs_integrity),
    ("python-backed-wrappers",_group_wrappers),("package-hygiene",_group_hygiene),("release-integrity",_group_release),
]


def run_regression(root: Path | None = None, *, json_output: bool = False) -> dict:
    root=(root or package_root()).resolve();results=[];failed=False
    for idx,(name,fn) in enumerate(GROUPS,1):
        try:
            fn(root);results.append({"test":name,"passed":True,"error":None})
            if not json_output:print(f"[{idx:02d}/{len(GROUPS):02d}] {name:.<48} PASS")
        except Exception as exc:
            failed=True;results.append({"test":name,"passed":False,"error":str(exc)})
            if not json_output:print(f"[{idx:02d}/{len(GROUPS):02d}] {name:.<48} FAIL\n  {exc}")
            break
    summary={"status":"FAILED" if failed else "VALIDATED","passed":sum(x["passed"] for x in results),"failed":sum(not x["passed"] for x in results),"total":len(GROUPS),"results":results}
    if json_output:print(json.dumps(summary,ensure_ascii=False,indent=2))
    elif not failed:print(f"REGRESSION_OK: {len(GROUPS)} groups")
    if failed:raise ADEError("REGRESSION_FAILED")
    return summary
