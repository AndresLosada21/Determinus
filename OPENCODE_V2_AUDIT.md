# OpenCode V2 audit — ADE v5.2.0

Esta release foi alinhada à documentação V2 atual e às evidências de runtime fornecidas na sessão.

## Decisões principais

### Agents
Subagents recebem contexto próprio. Consequência: repetir a mesma constituição longa em Orchestrator + owner + leaf multiplica custo. v5.2 mantém system prompts pequenos, reduz `steps` e usa handoff compacto.

### Skills
O body de uma Skill é carregado quando invocado. v5.2 usa `metadata.opencode/autoinvoke: false` e remove a instrução antiga “carregue a Skill antes de trabalho não trivial”.

### Instructions
`AGENTS.md` é contexto persistente/privilegiado. v5.2 reduz `AGENTS.managed.md` a invariantes globais e move regras de papel para agents/references.

### Subagent depth
A configuração top-level antiga é aceita por compatibilidade, mas não é tratada como superfície V2 suportada. Installer e runtime gate exigem `experimental.subagent_depth=2`; per-agent depth foi removido.

### Provider retry
O Promise plugin expõe retry hook para erros de provider. v5.2 usa retry bounded para a assinatura auto-only observada, sem converter falha determinística em sucesso.

### Behavioral validation
O harness anterior acabou aceitando uma cadeia diferente da propriedade original. v5.2 separa core runtime de behavioral eval e restaura asserts estritos: `engineer -> explorer` nunca prova `project-manager -> tracker-operator`.

### Runtime state
`ade_status` é compacto. Full state/evidence é explicitamente solicitado; histórico completo fica em JSONL. Isso reduz o volume retornado ao modelo e evita crescimento indefinido de `control.json`.
