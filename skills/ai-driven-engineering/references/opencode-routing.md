# Roteamento OpenCode

Grafo principal:
`orchestrator -> product-owner | project-manager | engineer`
`engineer -> specialists`

`orchestrator` é primary. `product-owner`, `project-manager` e `engineer` são `all`. Especialistas são `subagent`.

A raiz precisa de `subagent_depth: 2` para Engineer delegar do nível 1 para especialistas no nível 2. Especialistas não possuem permissão `subagent`.

Não use fan-out indiscriminado: até 3 especialistas simultâneos por onda por padrão.


## Enforcement

O grafo acima é executável. Control agents não devem apenas explicar o grafo: devem chamar `subagent` quando o owner é necessário e permitido.

- Orchestrator não pede confirmação para chamar PO/PM/Engineer.
- Engineer não pede confirmação para chamar specialists.
- Se a chamada estiver disponível, hand-back manual é proibido.
- Se a chamada falhar, use `ROUTING_BLOCKED` com evidência da tentativa.
- Continue handoffs automaticamente até gate material, blocker real ou conclusão.
