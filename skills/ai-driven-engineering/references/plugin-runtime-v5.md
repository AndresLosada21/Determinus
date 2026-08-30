# ADE Native Runtime v5

OpenCode V2 plugin `ai-driven-engineering.native` é o enforcement/runtime principal. Markdown agents e `.ai/` continuam canônicos/portáveis.

## Invariantes
- Tool visibility é filtrada por agent no session context hook.
- Custom permission actions `ade_*` são o segundo gate.
- Hard denies em agent config continuam finais.
- `SELF_CHECK_PASSED != VALIDATED`.
- Tracker provider somente via tracker-operator + `ade_tracker_read`/`ade_tracker_write`.
- Git mutation somente via vcs-operator + `.ai/vcs-policy.json`.
- `.ai/` é canonical project state; plugin storage é somente runtime/cache.
- Compatibility backend PowerShell pode existir atrás de typed tools, nunca exposto como raw shell ao worker.
