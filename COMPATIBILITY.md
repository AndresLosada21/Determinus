# Compatibility — ADE v5.2.0

## Target

| ADE | OpenCode | Python | Estado |
|---|---|---:|---|
| 5.2.0 | OpenCode V2 / Promise plugin contract | 3.9+ | source/static validated |
| 5.2.0 | `opencode2 beta-18684` Windows observado na sessão | 3.9+ | core runtime deve ser revalidado no host |

## OpenCode V2 invariants usados

- `Plugin.define({ id, setup })` / host SDK como peer dependency.
- project root é session-scoped (`sessionID -> session.get -> location-aware APIs`).
- context hook restringe tools e budget; não fabrica SystemPart.
- `experimental.subagent_depth: 2` é canônico; top-level legado é removido.
- Skill é explícita/lazy (`metadata.opencode/autoinvoke: false`).
- child sessions são tratadas como contextos independentes; por isso prompts/handoffs são pequenos.

## `tool_choice` auto-only providers

Alguns provider/model paths observados rejeitam `none`, `required` ou named choices e aceitam apenas `auto`. ADE v5.2 classifica esse `provider.invalid-request` e faz retry limitado. O hook suportado não é tratado como autorização para inventar/rewrite silencioso de requests; falha determinística continua terminal após o budget.

## Upgrade

Installer/migrator aceita linha v4, v5.0 e v5.1. Config legada `subagent_depth` é migrada para `experimental.subagent_depth` preservando outras chaves `experimental`.
