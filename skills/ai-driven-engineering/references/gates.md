# Gates e máquina de estados

`.ai/control.json` é o estado canônico. Markdown contém contexto e justificativas.

## Product
`DRAFT -> NEEDS_HUMAN_DECISION | AUTHORIZED_BY_REQUEST | APPROVED | SUPERSEDED`
`NEEDS_HUMAN_DECISION -> DRAFT | AUTHORIZED_BY_REQUEST | APPROVED | SUPERSEDED`
`AUTHORIZED_BY_REQUEST -> APPROVED | PRODUCT_ACCEPTED | SUPERSEDED`
`APPROVED -> PRODUCT_ACCEPTED | SUPERSEDED`
`PRODUCT_ACCEPTED -> SUPERSEDED`

## Delivery
`DRAFT -> NEEDS_DISCOVERY | NEEDS_DECISION | BLOCKED | READY`
`NEEDS_DISCOVERY -> DRAFT | NEEDS_DECISION | BLOCKED | READY`
`NEEDS_DECISION -> DRAFT | BLOCKED | READY`
`BLOCKED -> NEEDS_DISCOVERY | NEEDS_DECISION | READY`
`READY -> IN_EXECUTION | BLOCKED`
`IN_EXECUTION -> BLOCKED | DELIVERY_ACCEPTED`

## Engineering
`DISCOVERING -> NEEDS_DECISION | READY_FOR_IMPLEMENTATION | BLOCKED`
`NEEDS_DECISION -> DISCOVERING | READY_FOR_IMPLEMENTATION | BLOCKED`
`BLOCKED -> DISCOVERING | NEEDS_DECISION | READY_FOR_IMPLEMENTATION`
`READY_FOR_IMPLEMENTATION -> IMPLEMENTING | BLOCKED`
`IMPLEMENTING -> VERIFYING | BLOCKED`
`VERIFYING -> IMPLEMENTING | BLOCKED | ENGINEERING_ACCEPTED`

## Global
Um plano com `required: false` não participa do gate. `global_status` é `DONE` somente quando todos os planos requeridos estão nos estados finais de aceitação; caso contrário é `NOT_DONE`.


## External work-management gate

Status de GitHub Projects, Jira ou Linear não altera os estados internos acima. Por padrão, uma transição externa para o estado terminal configurado só é permitida quando `global_status == DONE`. Estados externos intermediários podem refletir progresso de Delivery, mas nunca criam acceptance.
