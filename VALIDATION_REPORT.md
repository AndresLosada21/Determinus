# Validation report — ADE v5.2.3 consolidation build

## Source gates deste pacote

- Python regression: 34 grupos (hash final selado no fim do build);
- Static policy: obrigatório;
- TypeScript `tsc --noEmit`: obrigatório;
- Node plugin tests: **27** testes, incluindo SDK documentado (`Plugin.define`) e fallback beta sem named `Plugin` export;
- structured handoff schema/authority/limits e revision neutrality;
- state-driven nested fixture (Delivery → Project Manager → Tracker Operator);
- bounded plugin-list startup retry;
- migration v5.2.1 → v5.2.3 e rollback simulados no lifecycle de empacotamento.

## Validation architecture

### Core Runtime
Manifest, plugin load, provider baseline, catalog, tool execution e configuração V2 resolvida.

### Contract Assurance
Determinística e obrigatória em todo `validate`: 18 agents, 26 tools, Structured Handoffs, limits/authority, routing contract, generation budgets, retry policy e telemetry privacy.

### Behavioral Canary
Estrita e model/provider-driven. O nested scenario constrói estado canônico que requer **Delivery**; portanto o route esperado é Project Manager → Tracker Operator. O Orchestrator pode consultar `ade_status` e `ade_route_snapshot` uma vez cada, porque isso faz parte do happy path STATE_DRIVEN, mas nenhuma rota alternativa é aceita.

`assure --model` executa Behavioral Canary por padrão. `--core-only` nunca alega Release Assurance.

## Windows/OpenCode

A v5.2.3 permanece `SOURCE_VALIDATED_RUNTIME_PENDING` até ser instalada no OpenCode V2 alvo. O pacote foi desenhado especificamente para cobrir os dois comportamentos observados na beta-18684: ausência do named export `Plugin` e race curta entre restart e `plugin list`. O runtime real continua sendo a autoridade final.
