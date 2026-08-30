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

Com `COMPLETE`, o child não deve consultar status/state/evidence, carregar Skill ou reler arquivos para reconfirmar inputs já fornecidos. Discovery adicional só existe quando `DISCOVERY_ALLOWED: true` ou faltar um dado indispensável.

O handoff tipado continua canônico; prosa final é UX.
