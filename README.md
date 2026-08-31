# ADE 6.0.11 — Runtime Agent Catalog Registration

ADE 6 keeps the durable event-sourced kernel introduced in v6 and adds bounded project self-healing for historical/existing repositories. OpenCode remains the session/model executor; the ADE kernel owns workflow state, scheduling, retries, deterministic evidence, project-policy normalization, authorization boundaries and completion.

## Core rule

**The runtime coordinates and repairs deterministic ADE state; LLMs remain disposable workers.**

- No worker can create another worker.
- No LLM writes canonical workflow state directly.
- SAFE_AUTO_REPAIR may only create/normalize ADE-owned project policy with security-preserving defaults.
- HUMAN_GATE remains mandatory for policy authorization and every exact-effect high-impact operation.
- Explicit deny values are never elevated by self-heal.
- Unknown/malformed historical state fails closed instead of being guessed.
- Engineering `DONE` still requires deterministic checks.

## Existing-project self-heal

Before an engineering DAG is created, ADE performs one bounded deterministic reconciliation pass:

1. If `.ai/execution-policy.json` is absent, create a secure skeleton with `authorized:false`.
2. Normalize known schema-1 omissions while preserving unknown/custom fields.
3. Migrate legacy `runner:"process"` checks missing `allow_host_process` to the explicit process-runner semantics. `allow_host_process:false` remains an absolute veto.
4. Add only restrictive Docker defaults (`network=none`, `ro`, no workspace writes, no mutable image/network opt-in).
5. Never auto-authorize the project policy and never issue an exact-effect grant.

A process check still cannot execute merely because it self-healed: the project policy must already be human-authorized and `ade_project_check` still requires the external single-use `/ade-authorize` grant bound to the exact check definition.

This means old projects no longer fail repeatedly because a managed field or policy file is missing, while security-sensitive intent remains human-controlled.

## OpenCode beta-18721 worker contract

ADE 6.0.11 retains the host-validated worker fix for OpenCode `0.0.0-beta-18721`, source `90fb6562ce09782c311040ba39a9d50edec6ad0e`: canonical `SystemPart`, settled `type:"assistant"` evidence, `Session.Info.outcome` failure taxonomy, and no speculative same-ID wake retry.

## Install / migrate

From the 6.0.11 release bundle:

```powershell
py -B .\install-opencode-v6.0.11.py
# direct from ADE 6.0.10
py -B .\migrate-opencode-v6.0.10-to-v6.0.11.py

opencode2 service restart
py -B .\validate-opencode-v6.0.11.py
```

Do not hotpatch the installed plugin and do not use `--force` for the normal 6.0.10 → 6.0.11 migration. The canonical OpenCode `agents` map is reconciled idempotently while non-ADE definitions are preserved.

`SOURCE_VALIDATED` and `HOST_VALIDATED` remain distinct. Host validation requires a real beta-18721 canary.
