# ADE v5.2.3 — Delegation-Driven Children

## Objetivo

Fechar a lacuna encontrada no Behavioral Canary da v5.2.2: owners/children ainda reidratavam estado e evidence por hábito, mesmo quando o parent já entregava contexto suficiente.

## Mudanças

- `STATE_DRIVEN` permanece no Orchestrator.
- Child agents críticos passam a `DELEGATION_DRIVEN`.
- Toda delegação deve carregar `ADE_DELEGATION_CONTEXT: COMPLETE` com objetivo, inputs autoritativos, ação requerida, child requerido, política de discovery e contrato de retorno.
- Product Owner, Project Manager e Engineer deixam de receber `ade_status`, `ade_state_get`, `ade_evidence_record` e `ade_evidence_query`; o Orchestrator é o ponto de estado global.
- Explorer/Implementer deixam de registrar evidence genérico redundante; Verifier perde evidence read/write genérico; Tracker Operator fica somente com `ade_tracker_read`, `ade_tracker_write` e `ade_handoff_submit`.
- Tracker Operator também perde `read/glob/grep/skill` do catálogo core, tornando-o uma leaf operacional estrita.
- Canaries continuam estritos; não aceitam state/evidence extra para “fazer passar”.
- Novo `behavioral-reliability --trials N [--strict]` repete os mesmos asserts estritos e reporta taxa de sucesso, sem converter falhas em sucesso.

## Validação

Core, Contract Assurance e Behavioral Canary continuam separados. `assurance --model` continua exigindo um canary estrito. O reliability report é diagnóstico estatístico adicional, não substitui o gate.
