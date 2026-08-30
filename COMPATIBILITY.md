# Compatibility — ADE v5.2.2

| ADE | OpenCode | Python | Estado |
|---|---|---:|---|
| 5.2.2 | V2 Promise plugin API | 3.9+ | source/static validated |
| 5.2.2 | `opencode2 beta-18684` Windows | 3.9+ | revalidate core+contract after upgrade |

## Upgrade inputs aceitos

Migrator aceita instalações gerenciadas v4.x, v5.0.x, v5.1.x e v5.2.0.

## API V2 usada
- `Plugin.define` Promise contract;
- session-scoped Location via `session.get` + agent list envelope;
- `session.hook("context")` para tool visibility + generation budget + dispatch metadata;
- `session.hook("retry")` para retry bounded;
- `session.context` best-effort para exact usage/cost quando exposto;
- commands synthetic para diagnostics/metrics.

Structured Handoff não depende de um output-final hook inexistente: o canal canônico é a typed tool `ade_handoff_submit`.


## Plugin definition compatibility adapter (v5.2.2)

The documented OpenCode V2 Promise plugin contract uses `Plugin.define(...)`. The Windows build `0.0.0-beta-18684` observed in runtime validation can expose an SDK shape where the named `Plugin` export is absent. v5.2.2 imports the SDK as a namespace and uses `Plugin.define` when available, otherwise exporting the same `{ id, setup }` definition directly. This avoids a named-export load failure while retaining the documented contract on newer hosts. Runtime validation remains authoritative for the target build.
