# Delegation-Driven Child Contract

## Princípio

O Orchestrator resolve estado global e owner. O child executa o escopo delegado sem reidratar o control plane por hábito.

Envelope padrão:

```text
ADE_DELEGATION_CONTEXT: COMPLETE
objective: <objetivo único>
authoritative_inputs: <somente fatos necessários>
required_action: <ação>
required_child: <agent quando aplicável>
DISCOVERY_ALLOWED: false|true
return_contract: ade_handoff_submit exatamente uma vez + resposta curta
```

Desde v5.2.8, `COMPLETE` não é apenas instrução: o Managed Delegation Runtime persiste essa condição por child session. Skill e raw `subagent` são removidos; reidratação canônica é negada salvo arquivo explicitamente requerido; `control.json` permanece bloqueado. Com `DISCOVERY_ALLOWED:false`, discovery tools também são removidas. Coordenadores com `required_child` têm no máximo duas ações de discovery antes da delegação obrigatória.

A delegação deve usar `ade_delegate`, não o `subagent` nativo. O handoff tipado continua canônico; se o último step remover tools, o runtime preserva a prosa em fallback `PARTIAL` não autoritativo, nunca `DONE`.
