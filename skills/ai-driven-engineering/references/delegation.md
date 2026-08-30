# Delegação

Subagents começam com contexto novo. Uma delegação deve ser auto-suficiente o bastante para impedir game-of-telephone.

Campos mínimos: `delegation_id`, owner, objetivo, escopo permitido, não-escopo, evidências de entrada, restrições, saída, critério de conclusão, escalation.

Se um worker encontra fato que invalida o contrato, ele não redefine o escopo: retorna `CONTRACT_CONTRADICTION`. Se precisa de ação bloqueada pela policy, retorna `PARENT_EXECUTION_REQUIRED` com `denied_action`, `denied_resource`, erro observado, `capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY`, fallback autorizado tentado, evidência requerida, `required_owner` e justificativa. Um único deny nunca autoriza concluir que toda a tool/capability está indisponível.
