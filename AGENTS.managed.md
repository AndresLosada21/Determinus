<!-- AI-DRIVEN-ENGINEERING:BEGIN v4 -->
## AI-Driven Engineering Runtime v4.2.3

Para trabalho de software/produto não trivial, use a skill `ai-driven-engineering` e preserve separação de autoridade:

- **Product Plane** decide WHY/WHAT.
- **Delivery Plane** decide WHEN/ORDER/DEPENDENCIES/DELIVERY STATE; `tracker-operator` apenas materializa essas decisões em sistemas externos.
- **Engineering Plane** decide HOW e Engineering Acceptance.
- **Orchestration** coordena handoffs e gates, sem absorver a autoridade dos outros planos.

Regras invariantes:
- `implemented != validated != engineering accepted != delivery accepted != product accepted`.
- Evidência deve distinguir `OBSERVADO`, `INFERIDO`, `PROPOSTO`, `VALIDADO`, `DESCONHECIDO`.
- Segredos e credenciais não são conteúdo de trabalho; não leia nem replique valores sensíveis.
- Subagents recebem contexto novo; delegações devem explicitar objetivo, escopo, evidências de entrada, restrições, saída e critério de conclusão.
- `subagent_depth` configurado não é evidência suficiente de nesting operacional: trate como `SUBAGENT_DEPTH_CONFIGURED` até um probe real `orchestrator -> owner -> leaf` concluir com `SUBAGENT_DEPTH_VALIDATED`.
- Se o runtime retornar `Subagent depth limit reached`, não recomende `experimental.subagent_depth` por inferência; reporte o erro observado e use o runtime de compatibilidade/probe do pacote.
- Especialistas aninhados não devem depender de permission `ask`; ações fora da policy devem subir como `PARENT_EXECUTION_REQUIRED`.
- Fan-out padrão: no máximo 3 especialistas simultâneos por onda, salvo justificativa explícita.
- **Delegate-first:** quando um agente tem `subagent` permitido cujo papel é owner do trabalho, deve invocá-lo; descrever o que o subagent faria não substitui a chamada.
- **No hand-back:** não peça ao usuário para executar comandos, testes, leituras ou invocações que o runtime/agents permitidos podem executar.
- Delegação interna já autorizada não exige confirmação do usuário. Perguntas humanas são para decisões materiais/permissions reais, não para roteamento.
- Só declare `ROUTING_BLOCKED` após ausência real da ferramenta `subagent` ou erro/deny observado em uma tentativa de chamada.
- Orchestrator segue `delegate-first -> owner execution -> synthesize-last`; Engineer segue `explorer/default discovery -> specialist execution -> independent evidence`.
- Git metadata de outro workspace usa o wrapper read-only `git-readonly.ps1`; não amplie allowlists com `git -C *`.
- Checks Docker/específicos do projeto usam `run-project-check.ps1` e `.ai/execution-policy.json` autorizada; `docker run*` genérico continua proibido.
- Work management externo (GitHub Projects/Jira/Linear) é execution surface, não fonte canônica de acceptance.
- Status externo terminal não substitui gates; por padrão só pode ser promovido após `global_status == DONE`.
- `DONE` global requer todos os planos aplicáveis aceitos no estado canônico `.ai/control.json`.
<!-- AI-DRIVEN-ENGINEERING:END v4 -->
