---
name: ai-driven-engineering
description: Operating model para entrega de software orientada por agentes no OpenCode, separando Produto, Entrega e Engenharia por contratos, evidências, gates e delegações tipadas.
compatibility: Projetado para OpenCode V2; requer permissions V2 e subagent_depth >= 2 para o fluxo nested Engineer -> specialists.
---

# AI-Driven Engineering v4.1

Esta skill é a constituição operacional para trabalho de software/produto coordenado no OpenCode. Ela é **agnóstica de stack, provider, model, tracker e MCP**, mas é deliberadamente opinativa sobre processo e usa OpenCode V2 como runtime.

## 1. Planos e autoridade

**Product Plane — WHY / WHAT**
- outcome, problema, usuário/cliente, escopo, não-escopo, critérios de produto;
- prioridade proposta e Product Acceptance;
- owner: `product-owner`.

**Delivery Plane — WHEN / ORDER / DEPENDENCIES / DELIVERY STATE**
- readiness, dependências, ondas, riscos, checkpoints, gates de integração/release;
- Delivery Acceptance;
- owner: `project-manager`.

**Engineering Plane — HOW / TECHNICAL EVIDENCE**
- descoberta, arquitetura, plano técnico, implementação, testes, verificação, review, integração;
- Engineering Acceptance;
- owner: `engineer`, que coordena especialistas.

**Orchestration**
- coordena handoffs e contradições;
- mantém o gate global;
- não redefine a autoridade dos planos;
- owner: `orchestrator`.

Leia `references/organization.md` para a matriz de autoridade completa.

## 2. Invariantes

1. `implemented != validated != ENGINEERING_ACCEPTED != DELIVERY_ACCEPTED != PRODUCT_ACCEPTED`.
2. Um plano não pode aceitar por outro plano.
3. Contradições entre contratos bloqueiam avanço até decisão do owner correto.
4. Ausência de evidência é `DESCONHECIDO`, não sucesso implícito.
5. Segredos não devem ser lidos, copiados ou persistidos em evidências.
6. Especialistas de profundidade 2 não devem depender de `ask`; ações fora da allowlist retornam `PARENT_EXECUTION_REQUIRED`.
7. Delegação é contrato: objetivo, escopo, entrada, restrições, saída e critério de conclusão.
8. Paralelismo só quando tarefas são independentes; fan-out padrão <= 3 por onda.
9. Estado global canônico é `.ai/control.json`; Markdown explica, mas não substitui o estado validável.
10. `DONE` somente quando todos os planos `required: true` estão aceitos.

## 3. Roteamento é execução, não recomendação

A arquitetura só é considerada cumprida quando o agente owner é **realmente invocado**. Dizer “o Engineer deveria chamar o Explorer”, fornecer comandos para o usuário executar ou perguntar se pode delegar não satisfaz o workflow quando a ferramenta `subagent` está disponível e permitida.

Invariantes de roteamento:
- `orchestrator`: **delegate-first -> owner execution -> synthesize-last**;
- `engineer`: discovery técnico relevante usa `explorer` por padrão; mutação usa `implementer`; evidência independente usa `verifier`/`reviewer` conforme risco;
- delegação interna permitida não precisa de confirmação humana;
- não fazer hand-back de trabalho que o runtime consegue executar;
- continuar automaticamente entre handoffs até `DONE`, gate material ou blocker real;
- `ROUTING_BLOCKED` só depois de ausência real da ferramenta ou tentativa de invocação com erro/deny.

Estas invariantes também ficam no system prompt dos control agents e no `AGENTS.md` gerenciado porque skills são carregadas sob demanda; o sistema não deve depender de o modelo lembrar de carregar a skill para saber que precisa rotear.

Leia `references/routing-enforcement.md`.

## 4. Evidência

Use os estados:
- `OBSERVADO`: fato diretamente estabelecido.
- `INFERIDO`: conclusão baseada em evidências, ainda não verificada diretamente.
- `PROPOSTO`: decisão ou mudança ainda não executada/aceita.
- `VALIDADO`: verificação executada com resultado registrado.
- `DESCONHECIDO`: fato material sem evidência suficiente.

Leia `references/evidence.md`.

## 5. Seleção do fluxo

Classifique o trabalho:

**LEAN** — mudança pequena, local, reversível, sem impacto de produto relevante.
- Product/Delivery podem ser `required: false`.
- Engineering continua exigindo evidência proporcional.

**STANDARD** — mudança de produto/engenharia normal com dependências e testes.
- usa Product, Delivery e Engineering quando aplicáveis.
- reviewer ou verifier independentes conforme risco.

**HIGH_ASSURANCE** — auth, dados sensíveis, dinheiro, migração, segurança, infra crítica, compatibilidade pública ou blast radius alto.
- exige Product + Delivery + Engineering;
- exige verifier + reviewer e normalmente security-reviewer/integrator;
- rollback e evidência executada são obrigatórios.

Leia `references/routing-profiles.md`.

## 6. Ciclo end-to-end

1. **Intake** — entender pedido e evidência disponível.
2. **Product Gate** — criar/validar Product Contract quando o pedido carrega decisão de produto.
3. **Delivery Gate** — decompor escopo autorizado, dependências, readiness e ondas.
4. **Engineering Contract** — tornar HOW, restrições, interfaces, testes e rollback explícitos.
5. **Delegation** — Engineering Lead delega somente trabalho técnico bem delimitado.
6. **Implementation** — worker muda código/config; tester pode escrever testes dentro da policy.
7. **Independent Verification** — verifier/reviewer não confiam no relato do implementer.
8. **Engineering Acceptance** — Engineer aceita contra o Engineering Contract.
9. **Delivery Acceptance** — PM confirma dependências e gates de entrega.
10. **Product Acceptance** — PO confirma outcome/critério de produto.
11. **Global Gate** — Orchestrator valida `.ai/control.json`; somente então `DONE`.

Leia `references/gates.md` e `references/handoffs.md`.

## 7. Delegação tipada

Toda delegação relevante deve conter:
- `delegation_id` e work item;
- objetivo e pergunta decisória;
- escopo permitido / explicitamente proibido;
- evidências de entrada e suposições;
- tools/commands permitidos relevantes;
- saída esperada;
- critério de conclusão;
- política de escalada.

Use `templates/delegation-contract.md`. Para contexto novo de subagent, prefira repetir o mínimo crítico a depender de memória implícita. Leia `references/delegation.md`.

## 8. Contratos e estado

Artefatos padrão do projeto:
- `.ai/product-contract.md`
- `.ai/delivery-contract.md`
- `.ai/engineering-contract.md`
- `.ai/checkpoint.md`
- `.ai/decision-log.md`
- `.ai/execution-policy.md`
- `.ai/control.json` — estado canônico e validável

Use o bootstrap do runtime para criar esses arquivos. Estados e transições válidos estão em `references/gates.md`.

## 9. Engineering specialist routing

Use especialistas por necessidade, não por ritual:
- `explorer`: facts do repo/runtime;
- `researcher`: fonte externa autoritativa;
- `modeler`: relações, arquitetura, estados/contratos;
- `engineering-planner`: decomposição técnica;
- `tester`: especificação/testes executáveis;
- `implementer`: mutação de código/config;
- `verifier`: validação independente executada;
- `debugger`: causa raiz;
- `reviewer`: correção/regressão/manutenibilidade;
- `security-reviewer`: riscos de segurança;
- `integrator`: readiness técnico de integração;
- `documenter`: documentação durável.

Leia `references/opencode-routing.md` e `references/parallelism.md`.

## 10. Runtime OpenCode

A v4 assume `subagent_depth: 2` na raiz da config. O fluxo nested é `orchestrator -> engineer -> specialist`. Como permissões de subagents são próprias e subagents têm contexto novo, cada agente carrega sua policy e deve carregar esta skill em trabalho não trivial.

A v4 evita `ask` em especialistas de profundidade 2. Se o OpenCode/runtime não suportar nesting de forma saudável, use o fallback operacional documentado em `references/opencode-runtime.md` e rode o smoke test.

## 11. Definição de DONE

`DONE` é um estado derivado, não uma frase do modelo. Para cada plano com `required: true`:
- Product deve estar `PRODUCT_ACCEPTED`;
- Delivery deve estar `DELIVERY_ACCEPTED`;
- Engineering deve estar `ENGINEERING_ACCEPTED`.

Valide com `validate-ai-state.ps1`. Se qualquer gate faltar, reporte o estado real e a próxima ação segura; nunca promova por conveniência.
