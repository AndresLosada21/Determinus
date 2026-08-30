# Structured Handoffs — ADE v5.2.3

## Objetivo

Remover texto livre de child agents da posição de fonte canônica de routing. O parent pode ler a resposta humana, mas a informação operacional deve existir em `ade_handoff_submit`.

## Contrato

| Campo | Limite | Regra |
|---|---:|---|
| `status` | enum | `DONE`, `PARTIAL`, `BLOCKED`, `FAILED` |
| `changed` | 8 itens × 180 chars | mudanças relevantes somente |
| `evidence_refs` | 8 × 240 chars | referências, não evidência duplicada |
| `blocker` | 800 chars | obrigatório quando `BLOCKED` |
| `required_owner` | enum | owner permitido pela autoridade do source agent |
| `next` | 500 chars | próximo movimento, não plano completo |
| objeto total | 4096 bytes | hard limit no plugin |

## Autoridade

O plugin obtém `source_agent` e `session_id` do tool context. O modelo não pode forjá-los.

`required_owner` é advisory e validado por source agent. Handoff não cria Product/Delivery/Engineering Acceptance e não altera plane revision.

## Persistência

- `.ai/handoffs.jsonl`: log completo durável;
- `control.json.recent_handoffs`: no máximo 3 versões compactadas;
- audit recebe apenas metadata do handoff.

## Routing

`routingHint(control)` continua state-driven. `handoffAdvisory(control)` compara o owner pedido pelo último handoff com o owner derivado do estado:

- `ALIGNED`: ambos apontam para o mesmo owner;
- `STATE_ONLY`: nenhum owner foi pedido;
- `STATE_PRECEDENCE`: há divergência e o estado canônico vence.

Isso evita que um leaf capture autoridade por texto ou handoff incorreto.

## UX

Depois de publicar a tool, o child responde em até 3 linhas. Behavioral canaries medem esse contrato no provider/model real.
