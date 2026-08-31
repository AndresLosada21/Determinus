# Compatibility — ADE v5.2.6 Hardened

| ADE | OpenCode | Python | Estado |
|---|---|---:|---|
| 5.2.6 | V2 Promise plugin API | 3.9+ | source/static validated |
| 5.2.6 | `opencode2 beta-18684` Windows | 3.9+ | revalidate core+contract after upgrade |
| 5.2.5 | V2 Promise plugin API | 3.9+ | superseded — migrate to 5.2.6 |

## Upgrade inputs aceitos

Migrator aceita instalações gerenciadas v4.x, v5.0.x, v5.1.x, v5.2.0–v5.2.5.

## API V2 usada
- `Plugin.define` Promise contract;
- session-scoped Location via `session.get` + agent list envelope;
- `session.hook("context")` para tool visibility + generation budget + dispatch metadata;
- `session.hook("retry")` para retry bounded;
- `session.context` best-effort para exact usage/cost quando exposto;
- commands synthetic para diagnostics/metrics.

Structured Handoff não depende de um output-final hook inexistente: o canal canônico é a typed tool `ade_handoff_submit`.


## Human authorization boundary (v5.2.6 Hardened)

**Repo policy != human authority.** Arquivos como `.ai/tracker-policy.json`, `.ai/vcs-policy.json` e `.ai/execution-policy.json` definem escopo máximo e limites, mas nunca concedem sozinhos autorização humana para operações destrutivas/externas. Operações de alto impacto (`ade_tracker_project_sync`, `ade_tracker_write`, `ade_vcs_stage/commit/push`, `ade_pr_create`, `ade_project_check`/`ade_diagnostic_check` com host process) exigem `ask` no OpenCode permission layer (`POLICY_ALLOWED` + `USER_APPROVED` vs `AUTO_APPROVED` vs `DENIED`). Em `opencode --auto`, `ask` vira `AUTO_APPROVED` — não deve ser registrado como `USER_APPROVED`. Se a API não distinguir confiavelmente, documenta-se a limitação e mantém-se fail-closed para mutações sensíveis. Ver `HARDENING.md`.

## Plugin definition compatibility adapter (v5.2.5–v5.2.6)

The documented OpenCode V2 Promise plugin contract uses `Plugin.define(...)`. The Windows build `0.0.0-beta-18684` observed in runtime validation can expose an SDK shape where the named `Plugin` export is absent. v5.2.5 imports the SDK as a namespace and uses `Plugin.define` when available, otherwise exporting the same `{ id, setup }` definition directly. This avoids a named-export load failure while retaining the documented contract on newer hosts. Runtime validation remains authoritative for the target build.

## GitHub Projects V2 deterministic adapter

The adapter uses the configured GitHub Project V2 node/field model and `updateProjectV2ItemFieldValue`. It currently handles single-select, iteration, number, date and text field values. GitHub/Jira/Linear generic adapters remain available through Tracker Operator for fallback compatibility.
