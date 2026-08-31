# Cost / Performance Intelligence — ADE v5.2.5

## Princípio

Observabilidade deve explicar custo/latência sem persistir conteúdo sensível. O ADE não grava prompt, mensagens ou tool arguments em telemetry.

## Eventos

### `model.dispatch`
- session id;
- agent;
- provider/model;
- generation budget;
- message count;
- advertised tool count;
- `approx_context_chars`;
- `approx_context_tokens` = chars/4.

A estimativa chars/4 é **capacidade/performance**, não billing.

### `tool.call`
- agent/tool;
- completed/blocked;
- duração.

### `provider.retry`
- provider/model;
- attempt;
- error type;
- retry decision/delay.

## `/ade-metrics`
Agrega uma janela do projeto e responde:
- tool calls / blocked calls;
- total tool duration;
- model dispatches;
- provider retries;
- input estimado despachado;
- requested output-token budget;
- distribuição por agent/tool/model.

## `/ade-cost`
Consulta `session.context` da sessão atual. Se o host expõe `usage`/`tokens` e `cost`, agrega os campos como `exact_provider_usage`. Caso contrário, responde `available: false` e mantém somente estimativas de dispatch.

Também mede, quando observável nas mensagens da sessão:
- subagent calls;
- skill calls;
- `ade_handoff_submit` calls;
- assistant text chars.

Nenhuma estimativa é apresentada como token faturado.
