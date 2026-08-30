# ADE v5.2.0 — Release Notes

## Objetivo
Estabilizar o v5.1 e reduzir custo/ruído do orchestration sem remover Product/Delivery/Engineering governance.

## Corrigido
- `evidence: {}` não quebra mais `ade_evidence_record`.
- project-check missing IDs retornam root/policy/request/available IDs.
- Windows smoke cleanup é best-effort e não mascara a causa primária.
- `experimental.subagent_depth` substitui top-level/per-agent legado.
- behavioral eval deixa de ser release-blocking e deixa de aceitar provas “equivalentes” por leniência.
- retry bounded para provider auto-only `tool_choice` invalid requests.

## Eficiência
- routing state-driven;
- Orchestrator só recebe `ade_status` + `ade_route_snapshot`;
- Skill explicit/lazy;
- prompts/AGENTS menores;
- compact handoffs e user brief;
- evidence default 5;
- state compact by default;
- generation budgets e steps reduzidos.

## Observabilidade
- `/ade-why`, `/ade-trace`, `/ade-metrics`;
- `.ai/telemetry.jsonl` sem argumentos/prompts;
- `.ai/evidence.jsonl` para histórico durável.

## Validação desta build
Source/static/unit é validável de forma determinística. Runtime OpenCode V2/Windows e behavioral provider/model devem ser executados no host final com os scripts do bundle.
