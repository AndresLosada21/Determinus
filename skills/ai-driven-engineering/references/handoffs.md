# Handoffs

Todo handoff entre planos ou entre Engineer e specialist deve dizer: o que foi pedido, o que foi observado, decisões já autorizadas, lacunas, artefatos alterados, evidências, riscos e próxima ação.

Status úteis: `READY`, `BLOCKED`, `NEEDS_DECISION`, `NEEDS_DISCOVERY`, `PARENT_EXECUTION_REQUIRED`, `CROSS_PLANE_HANDOFF_REQUIRED`, `CONTRACT_CONTRADICTION`.

`PARENT_EXECUTION_REQUIRED` deve preservar o `action + resource` negado e nunca generalizar um deny específico. Se `required_owner` estiver em outro plano, o parent encaminha `CROSS_PLANE_HANDOFF_REQUIRED` ao Orchestrator, que executa o roteamento.

Nunca use “done” como sinônimo de “implementei”.
