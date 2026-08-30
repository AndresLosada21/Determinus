# @ai-driven-engineering/opencode-plugin v5.2.0

OpenCode V2 Promise plugin do ADE.

Principais superfícies:
- 25 typed tools e 18 role-specific capability sets;
- session-scoped project resolution;
- state-driven `ade_status` + `ade_route_snapshot`;
- compact/full state selector;
- durable evidence (`.ai/evidence.jsonl`) e minimal telemetry (`.ai/telemetry.jsonl`);
- generation budgets por agent;
- bounded retry para provider `invalid-request` auto-only;
- `/ade-doctor`, `/ade-why`, `/ade-trace`, `/ade-metrics` sem precisar poluir respostas normais.

Teste local:

```text
npm test
npm run typecheck
```
