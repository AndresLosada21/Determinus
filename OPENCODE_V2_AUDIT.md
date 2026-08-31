# OpenCode V2 audit — ADE v5.2.5

Esta release consolida a linha v5.2 contra a superfície atual do OpenCode V2 e contra os problemas observados em runtime Windows/provider.

## Agents e contexto

Subagents executam em child sessions com contexto próprio. Repetir constituição longa em Orchestrator, owners e leaf agents multiplica custo. A v5.2.5 mantém prompts de papel curtos, reduz `steps`, usa generation budgets e desloca estado/auditoria para tools tipadas.

## Skills

Skills permanecem lazy-loaded. `metadata.opencode/autoinvoke: false` evita que a constituição ADE inteira seja carregada automaticamente em toda child session. Agents só carregam a Skill quando uma regra excepcional exigir material de referência não presente no papel atual.

## Instructions

`AGENTS.md` é tratado como contexto privilegiado e persistente. `AGENTS.managed.md` contém somente invariantes globais; regras de autoridade e execução ficam nos agents/plugin para reduzir redundância.

## Subagent depth

A superfície canônica usada pelo pacote é `experimental.subagent_depth=2`. O campo top-level legado e frontmatter per-agent foram removidos dos artefatos gerenciados.

## Structured Handoff

A API de plugins usada pelo ADE expõe hooks de contexto/request/retry e APIs de sessão, mas o ADE não depende de interceptar/regravar a prosa final de um child. O canal canônico child -> control plane é `ade_handoff_submit`:

- source agent/session derivados do tool context;
- schema e limites validados pelo plugin;
- authority whitelist por source agent;
- `BLOCKED` exige blocker;
- persistência em `.ai/handoffs.jsonl`;
- janela compacta em `control.json`;
- publicação não incrementa revision nem altera acceptance;
- route snapshot trata o handoff apenas como advisory; estado canônico tem precedência.

A resposta livre do child é UX e pode ser ignorada pelo control plane quando houver handoff canônico.

## Provider retry

O Promise plugin expõe retry hook para falhas de provider. A v5.2.5 classifica somente a assinatura auto-only `tool_choice` observada como retry bounded. Repetição persistente continua sendo falha real; o plugin não converte incompatibilidade determinística em sucesso e não reescreve silenciosamente a semântica da request.

## Validation tiers

O problema do harness anterior era misturar runtime determinístico com obediência probabilística do modelo e depois tornar asserts cada vez mais lenientes. A v5.2.5 separa:

1. **Core Runtime** — manifesto, plugin, provider baseline, catálogo, execução real de tool e config V2;
2. **Contract Assurance** — determinística e obrigatória em todo `validate`; prova schema/capabilities/ownership/limits/persistence/privacy;
3. **Behavioral Canary** — model-driven e estrito; prova rota e handoff estruturado observáveis, sem depender de frases mágicas.

`assure --model` executa behavioral por padrão. `--core-only` nunca emite Release Assurance.

## Runtime state

`ade_status` e `ade_route_snapshot` são as superfícies normais do Orchestrator. `ade_state_get` é compacto por default. Evidence/handoff/telemetry completos ficam em JSONL e só entram no contexto sob demanda.

## Cost / Performance Intelligence

`.ai/telemetry.jsonl` armazena apenas metadados operacionais:

- `tool.call` — agent/tool/status/duração;
- `model.dispatch` — provider/model, generation budget, contagens e estimativa de contexto;
- `provider.retry` — tentativa/tipo/decisão.

Nenhum prompt, tool args ou conteúdo de arquivo é persistido nessa telemetria. `/ade-cost` consulta `session.context` best-effort: se usage/cost do provider estiverem expostos, reporta valores exatos; senão sinaliza explicitamente estimativa de contexto (`chars/4`) em vez de chamá-la de billing.

## Resultado arquitetural

A linha v5.2 passa a seguir quatro princípios:

- **verbose durable state, terse agent communication**;
- **state-driven routing, no ritual reconfirmation**;
- **typed handoff over free-text authority**;
- **deterministic contracts + strict behavioral canaries**.
