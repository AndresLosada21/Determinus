# Auditoria Determinus / OpenCode Beta — cache Go e Zen

Data: 05/09/2026. Revisão executada sobre código recuperado, com reprodução de defeitos no JavaScript distribuído.

## Conclusão

O Determinus 3.0.3 entregue anteriormente contém defeitos reais na preparação do contexto. A afirmação de que a explosão de tokens estava resolvida era abrangente demais. O guard pode alterar o prefixo de histórico a cada novo turno, descartar instruções atuais do usuário e deixar passar mensagens maiores que o teto anunciado.

O e-mail confirma que o serviço observou requisições sem identificação de sessão e sem User-Agent. Como Carlos informa que só usa essa chave dentro do OpenCode, a investigação deve se concentrar nesse processo, suas configurações e extensões. Não há necessidade de presumir uso da chave por outra aplicação.

Ainda assim, o defeito de contexto do plugin e a ausência de headers são fenômenos distintos. Não foi demonstrado que o Determinus 3.0.3 remove esses headers. Existe uma rota avulsa do Beta que não os acrescenta, mas não encontrei chamada dessa rota no Determinus recuperado. Portanto, há defeitos confirmados e um candidato concreto no host; a atribuição das requisições do e-mail continua aberta.

## Material efetivamente revisado

- `Determinus-3.0.3-hard-context-guard.zip`, recuperado do bundle entregue em 02/09.
- `Determinus-3.0.1-plugin-only-official-beta.zip`, para comparação da lógica anterior.
- `opencode-beta.zip`, anexo de 01/09 recuperado nesta revisão.
- Os hashes dos arquivos originais e cópias de evidência estão em `PROVENANCE.json`.

Não foi possível vincular esse ZIP do Beta ao último binário atualmente instalado no Windows. Há inclusive uma condição específica `agentID === "adv"` em `model-request.ts:333`; não trato esse arquivo como prova de um checkout oficial imutável. Não editei nem compilei o OpenCode.

## Achados no plugin

### P0 — O guard modifica inclusive a mensagem atual do usuário

Arquivo 3.0.3: `plugin/src/index.ts:384–430`, funções `compactTextPart` e `enforcePromptHistoryBudget`.

O loop percorre todas as mensagens e corta qualquer parte `text` com mais de 2.400 caracteres. Não verifica papel, recência ou importância da instrução. Guarda apenas começo e fim. Uma restrição no meio do pedido pode desaparecer antes de chegar ao modelo.

Reprodução no bundle: pedido sintético de 2.822 caracteres com `DO_NOT_DELETE_DATABASE` no centro perdeu essa instrução. O teste não executa nenhum comando de banco; apenas inspeciona texto.

Impacto: perda de requisitos, respostas inconsistentes e possíveis releituras/retrabalho. Isso não é uma compactação semântica que preserve decisões.

### P0 — Janela móvel altera o prefixo da conversa

Arquivo 3.0.3: `plugin/src/index.ts:435–449`; chamada incondicional no hook de contexto em `1889`.

O guard calcula um sufixo de mensagens e executa `messages.splice(0, omittedMessages)`. Quando o limite é atingido, acrescentar uma mensagem pode deslocar o início do histórico. Mesmo com o mesmo header e mesmo system prompt, esse trecho do prefixo muda e deixa de ser reutilizável como antes.

Reprodução: com 40 mensagens de aproximadamente 2.000 caracteres, a primeira mensagem retida era a de índice 17. Depois de acrescentar apenas uma, passou a ser a de índice 18. É uma alteração comprovada do payload; a perda exata de tokens em cache depende do provider e não foi medida em uma chamada paga.

### P1 — O teto de 48.000 caracteres não é um teto rígido

Arquivo 3.0.3: `plugin/src/index.ts:437–445`.

A última mensagem é sempre admitida, mesmo maior que o limite. Argumentos de tool-call, resultados JSON, erros e conteúdo multimodal não são limitados por `compactTextPart`. A expansão para recuperar mensagens de ferramentas também não recalcula `retainedChars`.

Reprodução: uma mensagem válida no formato nativo, com argumento de ferramenta grande, reteve 100.107 caracteres apesar do limite de 48.000. O guard mede mensagens por serialização JSON; não mede tokens, system prompt, schemas de ferramentas nem o corpo HTTP completo.

A promessa 7 de `TOKEN_GUARD_PLAN.md` não corresponde ao comportamento reproduzido.

### P1 — A adaptação nativa descarta resultados de skills sem preservação equivalente

Arquivo 3.0.3: `plugin/src/index.ts:290–299`, `compactV2ToolResultPart`.

O tratamento antigo verifica `task` e `skill` e tenta persistir o conteúdo antes de substituí-lo. O tratamento v2 apenas chama `dropToolOutput` quando o resultado textual excede 1.200 caracteres. Não aplica a proteção e não retorna ponteiro para recuperação.

Reprodução: um resultado de skill com 2.021 caracteres foi substituído integralmente por `[ADV:OUTPUT_DROPPED] ...`, sem caminho de arquivo. O resultado original pode continuar no armazenamento do host; isso não significa que o modelo recebeu a instrução necessária nem sabe como recuperá-la.

### P1 — Resultados não textuais não recebem o mesmo controle

Arquivo 3.0.3: `plugin/src/index.ts:292`.

A função só aceita `part.result.type === "text"`. O schema nativo do Beta admite também `json`, `error` e `content`. Um erro de 10.008 caracteres passou sem alteração no teste. Esses resultados ainda podem ser removidos pelo guard de histórico, mas não recebem a contenção individual anunciada.

### P1 — A 3.0.1 ainda reescrevia o system prompt com estado variável

Arquivo 3.0.1: `plugin/src/index.ts:1777–1800`; produtor em torno de `1405`.

O adaptador ativava o transform de sistema e substituía `event.system` pelo resultado de `applyAdvSystemBlock`, que recebe estado mutável do workflow. Isso é uma fonte concreta de mudança de prefixo. A 3.0.3 desativa esse transform com `hasSystemTransform = false`, mas introduz o problema de janela móvel descrito acima.

### P2 — O validador não valida cache nem headers

`validate-token-guard.ps1` verifica existência de arquivos, dependência e remoção de instalações antigas. Não observa requisições, prefixos, tokens em cache ou o estado do plugin carregado. `DETERMINUS_TOKEN_GUARD_OK` não prova conformidade Go/Zen.

A telemetria do plugin escuta `message.part.updated` e espera `step-finish` no formato antigo. O snapshot nativo do Beta usa eventos como `session.step.ended` e `session.usage.updated`. A ligação atual não demonstra cobertura desse fluxo v2; a revisão de compatibilidade deve incluir os eventos públicos realmente expostos. `session.usage.recorded` existe internamente, mas o próprio schema o exclui do manifesto público: não basta assinar esse nome em um plugin externo.

## Rastreamento dos headers no Beta

### Caminho de sessão

`packages/core/src/session/model-request.ts:199–207` monta `User-Agent`, `x-opencode-session`, identificação do cliente/projeto e outros headers. `prepare` inclui esse objeto em `LLM.request` e atribui `promptCacheKey` à sessão ou linhagem de fork.

`applyModelHooks`, a partir de `214`, permite que hooks `model.request` alterem headers/baseURL. `httpMiddleware`, a partir de `239`, expõe a requisição efetiva aos hooks HTTP.

`packages/ai/src/route/transport/http.ts:50–60` combina os headers antes da autenticação/transporte. Nesse ponto há propagação dos headers fornecidos pelo pedido; não encontrei uma remoção geral no caminho inspecionado.

Conversa normal, título, compactação e `session.generate` passam pela preparação de sessão no snapshot. A compactação desliga hooks de contexto, mas não elimina por isso a montagem dos headers.

### Caminho avulso sem preparação de sessão

`packages/core/src/generate.ts:60` executa:

```ts
llm.generate(LLM.request({ model: resolved.model, prompt: input.prompt }))
```

Esse método não recebe sessão e não acrescenta `http.headers` ou `promptCacheKey`. `packages/core/src/plugin/host.ts:219` o disponibiliza por `ctx.generate.text`; também há o endpoint `/api/generate`.

Com provider sem headers estáticos equivalentes, essa rota pode produzir exatamente as omissões indicadas no e-mail. Headers estáticos/configurados podem alterar o resultado, por isso a conclusão é condicional. Não há prova de que Carlos disparou essa rota, nem chamada a `ctx.generate.text` encontrada no Determinus 3.0.3.

Um hook de sessão do Determinus não cobre automaticamente essa rota, que não passa pelo disparador de hooks de sessão. Seria incorreto instalar somente um `model.request` hook e declarar todas as chamadas do OpenCode corrigidas.

## Go e Zen

A documentação do Go exige identificação adequada do cliente e `x-opencode-session` para otimização de cache: https://opencode.ai/docs/go/ . O e-mail de Carlos anuncia possíveis erros a partir de 06/09.

A montagem de headers encontrada no Beta não é exclusiva de um nome de provider: portanto, o caminho normal deve preservá-los também nas chamadas Zen. Os problemas de prefixo do Determinus atingem tanto Go quanto Zen. A data/exigência de rejeição enviada para Go não foi presumida como uma política idêntica do Zen.

Header estável e prefixo estável são requisitos diferentes. Corrigir um não garante o outro. Um header precisa permanecer estável ao longo da conversa; um UUID novo a cada request ou um único ID fixo para todas as conversas não é a correção adequada.

O aviso `Instructions updated: core/skill-guidance` isoladamente também não prova invalidação completa: o snapshot possui baseline de instruções por época e atualizações cronológicas. É necessário observar a posição efetiva da alteração no payload.

## Correção recomendada, em ordem

1. Retirar a truncagem indiscriminada da mensagem do usuário e a janela móvel aplicada a cada request. A compactação deve estabelecer uma nova base preservando pedido, decisões, restrições e pares tool-call/tool-result; depois dessa transição, o prefixo permanece estável até a próxima compactação.
2. Conter resultados na produção, antes da primeira inclusão no histórico; persistir relatórios extensos e fornecer resumo/caminho. Não descartar automaticamente a instrução de uma skill. Não reescrever retroativamente resultados já enviados.
3. Aplicar orçamento por categorias e medir o payload completo. Não prometer um teto de tokens com base apenas em caracteres de algumas mensagens.
4. Adicionar observabilidade no hook HTTP de sessão para Go/Zen: presença de headers, comparação do ID com a sessão, host/path e versão. Não registrar API key, prompt ou corpo completo. Correlacionar isso com os eventos públicos de uso e hashes do prefixo antes/depois dos transforms.
5. Para chamadas auxiliares de plugins, usar `ctx.session.generate` quando houver uma conversa real. A rota avulsa do host precisa de correção oficial ou de deixar de ser usada nos callers controlados. Não modificar o executável do usuário nem declarar que um hook de sessão corrige essa rota.
6. Validar duas requisições consecutivas, retries, título, compactação, subagent e troca de agente. Verificar o payload/headers realmente emitidos e os tokens efetivamente reportados. Cache hit continua dependente do serviço; a aceitação não pode prometer zero cache miss em toda circunstância.

## Reprodução

Requer Node.js com suporte a `structuredClone` (o teste foi executado em Node 24.19.0):

```powershell
node .\reproduce-cache-defects.mjs .\evidence\determinus-3.0.3
```

O script executa as funções reais do bundle em VM isolada, com transcrições sintéticas. Não inicializa o plugin, não acessa rede, não usa credenciais e não instala nada. Os cinco resultados e números estão em `reproduction-results.json`.

Este pacote é uma auditoria reproduzível, não uma nova versão instalável. Não houve mudança no computador de Carlos. A validação confirma os defeitos listados; não mede economia real e não afirma ter identificado qual request gerou o aviso do Go.
