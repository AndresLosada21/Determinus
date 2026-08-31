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


## Authorization boundary (v5.2.6 Hardened)

**Repo policy != mutation authority.** Project policies define maximum scope only. High-impact operations remain `ask`-gated in OpenCode **and** require an external single-use `/ade-authorize` grant stored outside the project. `--auto` or saved `always allow` cannot replace that grant. The grant is bound to the exact resolved effect and revalidated before side effects. Provenance is `EXPLICIT_EXTERNAL_GRANT`; this means the capability came from the command channel external to ADE agent tools, not that the plugin can cryptographically prove physical human presence. See `HARDENING.md`.

## Plugin definition compatibility adapter (v5.2.5–v5.2.6)

The documented OpenCode V2 Promise plugin contract uses `Plugin.define(...)`. The Windows build `0.0.0-beta-18684` observed in runtime validation can expose an SDK shape where the named `Plugin` export is absent. v5.2.5 imports the SDK as a namespace and uses `Plugin.define` when available, otherwise exporting the same `{ id, setup }` definition directly. This avoids a named-export load failure while retaining the documented contract on newer hosts. Runtime validation remains authoritative for the target build.

## GitHub Projects V2 deterministic adapter

The adapter uses the configured GitHub Project V2 node/field model and `updateProjectV2ItemFieldValue`. It currently handles single-select, iteration, number, date and text field values. GitHub/Jira/Linear generic adapters remain available through Tracker Operator for fallback compatibility.
