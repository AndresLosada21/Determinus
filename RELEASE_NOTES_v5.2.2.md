# ADE v5.2.2 — Consolidation / Reproducibility Release

## Objetivo

v5.2.2 não adiciona uma nova camada de produto. Ela consolida os hotfixes observados durante a validação real da v5.2.1 para que o ZIP distribuído seja exatamente o código testado.

## Correções

- **Plugin loader compatibility adapter**: usa `Plugin.define` quando o SDK V2 expõe `Plugin`; em builds beta sem esse named export, cai para o mesmo objeto `{ id, setup }` sem falhar no import.
- **Behavioral canary alinhado a STATE_DRIVEN**: o fixture do nested canary exige Delivery, portanto o owner correto é Project Manager; `ade_status` e `ade_route_snapshot` são permitidos no root no máximo uma vez cada, sem aceitar rotas alternativas.
- **Plugin startup race**: `plugin list` ganha retry curto e limitado após restart; sucesso continua exigindo que `ai-driven-engineering.native` apareça de fato.
- **Source assurance do release bundle**: `assure --source` valida o source ZIP embutido antes de executar assurance da instalação, em vez de procurar `VERSION` dentro da instalação gerenciada.
- **Upgrade gerenciado**: v5.2.1 passa a ser predecessor suportado explicitamente para migração para v5.2.2.

## Invariantes preservados

- 18 agents;
- 26 typed tools;
- STATE_DRIVEN routing;
- Structured Handoffs canônicos e revision-neutral;
- Core + Contract + Behavioral como camadas distintas;
- `assure --model` só emite `RELEASE_ASSURANCE_VALIDATED` após behavioral canary;
- observabilidade/cost intelligence sem persistência de prompt.
