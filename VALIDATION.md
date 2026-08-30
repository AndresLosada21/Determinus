# Validation — ADE v5.2.0

## Camada A — Source/static (determinística)

Executada antes de empacotar:
- 32 grupos Python;
- 24 testes Node;
- TypeScript `tsc --noEmit`;
- 18 agents / 25 tools;
- capability/permission parity;
- state-driven routing e Skill lazy;
- evidence schema/log migration;
- bounded provider retry;
- telemetry sem payloads;
- template parity, VCS/security guards, project-check diagnostics;
- OpenCode V2 `experimental.subagent_depth` only.

## Camada B — Core runtime (bloqueante)

`validate --model` prova:
1. manifesto instalado schema 7;
2. plugin ativo e 18 agent surfaces;
3. provider baseline sem ADE;
4. catálogo ADE aceito;
5. `orchestrator -> ade_status` realmente executa;
6. configuração V2 resolvida;
7. `ADE_V5_RUNTIME_CORE_VALIDATED` / `RUNTIME_VALIDATED: 5.2.0`.

Esse caminho não depende de o modelo reproduzir frases exatas de um eval.

## Camada C — Behavioral eval (opcional, estrita)

`validate --model ... --behavioral` acrescenta:
- `orchestrator -> project-manager -> tracker-operator` real;
- capability-denial recovery;
- `implementer escalation -> engineer -> verifier`.

Esses tests permanecem estritos. Uma rota diferente **falha**; não existe marker leniente que converta comportamento alternativo em prova equivalente.

## Assurance

`assurance --source --model ...` combina source + core runtime. Acrescente `--behavioral` quando quiser certificar também model-compliance para aquele provider/model.

## Windows/Bun

Se `opencode2 service restart` reportar Bun `os error 1455` / arquivo de paginação pequeno, trate memória virtual/pagefile antes de interpretar a falha como problema ADE. O release bundle inclui `diagnose-windows-pagefile.ps1`.
