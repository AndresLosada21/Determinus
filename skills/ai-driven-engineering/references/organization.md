# Organização e autoridade

| Plano | Pergunta | Owner | Pode decidir | Não pode decidir |
|---|---|---|---|---|
| Product | WHY / WHAT | product-owner | outcome, escopo, critérios, prioridade proposta, Product Acceptance | arquitetura, implementação, ordem técnica |
| Delivery | WHEN / ORDER / DEPENDENCIES | project-manager | readiness, dependências, ondas, gates, Delivery Acceptance | escopo de produto, arquitetura, código |
| Engineering | HOW | engineer | design técnico, decomposição técnica, seleção de especialistas, Engineering Acceptance | prioridade de produto, Delivery/Product Acceptance |
| Orchestration | como coordenar | orchestrator | handoffs, gate global, contradições, estado canônico | decisões próprias dos três planos |

## Regra de contradição
Uma decisão de um plano que muda a responsabilidade de outro plano vira gate explícito. O owner impactado precisa aceitar, rejeitar ou reformular.


## Delivery execution operator

`tracker-operator` is a leaf execution role under `project-manager`.

It may materialize authorized Delivery decisions in GitHub Projects, Jira or Linear, but it owns no Product, Delivery or Engineering decision. External tracker state never creates internal acceptance.
