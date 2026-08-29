# Delegação

Subagents começam com contexto novo. Uma delegação deve ser auto-suficiente o bastante para impedir game-of-telephone.

Campos mínimos: `delegation_id`, owner, objetivo, escopo permitido, não-escopo, evidências de entrada, restrições, saída, critério de conclusão, escalation.

Se um worker encontra fato que invalida o contrato, ele não redefine o escopo: retorna `CONTRACT_CONTRADICTION`. Se precisa de ação bloqueada pela policy, retorna `PARENT_EXECUTION_REQUIRED` com o comando/ação exata e justificativa.
