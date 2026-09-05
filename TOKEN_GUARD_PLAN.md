# Correção aplicada — headers, contexto e instalação

Data: 05/09/2026. Base de código: Determinus 3.0.3 recuperado. A auditoria anterior está incluída em `AUDITORIA-ANTERIOR.md`. Este documento substitui as promessas anteriores de um teto rígido de tokens.

## Causas verificadas

A 3.0.3 cortava partes de texto acima de 2.400 caracteres, inclusive a mensagem atual do usuário. Sua janela móvel removia o começo do histórico conforme crescia. Também descartava resultados extensos de skills sem ponteiro de recuperação. Essas operações modificavam o payload e podiam prejudicar prefixos reutilizáveis. Sua contribuição exata à fatura não foi medida na conta.

A 3.0.1 registrava um transform de sistema com estado variável. A 3.0.3 deixou de ativá-lo, mas introduziu a janela móvel. A 3.0.4 mantém esse transform dinâmico desativado e remove os cortes de replay.

No Beta recuperado, `packages/core/src/session/model-request.ts` monta os headers das conversas. `packages/core/src/generate.ts` expõe geração avulsa sem sessão e sem essa preparação. A auditoria não encontrou o Determinus 3.0.3 chamando essa rota; portanto, ela é um caminho concreto de omissão, mas não prova qual chamada gerou o e-mail. A correção não atribui todas as ocorrências anteriores ao plugin.

Outra redução ocorria dentro das próprias ferramentas: prévia padrão de 1.200 caracteres descartava campos antes de o novo hook poder salvá-los. Esse ponto também foi corrigido.

## Plano implementado

| Frente | Mudança | Verificação |
|---|---|---|
| Preservar instruções e prefixo | Helpers de replay deixam de cortar/remover mensagens. Hook de contexto apenas observa hashes e tamanhos. | Pedido longo com restrição central, skills e histórico extenso permanecem iguais; append não desloca prefixo. |
| Reduzir resultados novos | Hook `execute.after` guarda saída completa, retorna excerto e preserva anexos/campos essenciais. | Recuperação do JSON original, preservação de imagens/status e falha de disco sem perda silenciosa. |
| Corrigir corte interno | `formatToolOutput` salva os dados antes da prévia e retorna `_fullResult`. Alvo padrão volta a 5.000 caracteres. | Teste recupera o conteúdo completo; testes de sessões/ferramentas voltam a passar. |
| Compactação com contexto | Catálogo limita modelos Go/Zen maiores a contexto efetivo 96.000 e habilita compactação nativa pela configuração. | Catálogo testado; não há truncagem arbitrária do usuário. Validação do motor no binário local permanece necessária. |
| Headers Go/Zen | Roteamento local restrito, identidade real da sessão e User-Agent do host + versão Determinus. | HTTP local real: Go/Zen × Responses/Chat Completions/Messages; headers, corpo, streaming e 429. |
| Chamadas auxiliares | Catálogo transformado cobre geração avulsa padrão. Repetição do mesmo payload sem sessão tem ID de operação estável. | Teste sem sessão e retry idêntico; operações diferentes não usam um ID global. |
| Cancelamento | Encerramento pelo cliente aborta o upstream, sem retry extra. | Teste interrompe SSE e observa fechamento no backend. |
| Observabilidade | Eventos públicos `session.step.started/ended`, deduplicação e atribuição por Go/Zen. | Cache de outra origem não valida o serviço solicitado; eventos repetidos não duplicam uso. |
| Instalação | Bundle autocontido, destino versionado, checksums, journal e rollback. | Instalação repetida, falha injetada, retomada e proteção de edição concorrente. |

## Como os headers são protegidos

O plugin inicia um retransmissor HTTP dentro de seu processo, em `127.0.0.1`, porta aleatória e rota opaca de 192 bits. O catálogo aponta os endpoints Go/Zen elegíveis para ele. O hook `model.request` vincula a sessão real nas conversas; o retransmissor acrescenta os headers também quando o caminho avulso padrão chega sem eles. Ele recebe a autenticação aplicada pelo host e a envia somente a `https://opencode.ai/zen/v1` ou `/zen/go/v1`.

São permitidos apenas `/responses`, `/chat/completions`, `/messages` e `/models`. Requisições com origem de navegador são rejeitadas. Não armazena chaves, não segue redirects, não reserializa o JSON e não cria retries adicionais. Mantém SSE/backpressure; desativa Responses WebSockets nesses modelos para usar HTTP/SSE.

A identidade segue esta ordem: `x-opencode-session`; afinidade existente; `prompt_cache_key`; hash do corpo para uma operação avulsa sem conversa. No último caso, não fingimos conhecer a sessão pai: a API pública avulsa não a fornece. O ID é estável para aquele payload/retry, não um ID único para todas as conversas nem um UUID novo por chamada.

Isso cobre o catálogo transformado e os hooks do plugin ativo. Não intercepta `fetch` privado de outras extensões, requisições anteriores à ativação ou overrides de URL aplicados depois do catálogo e fora dos hooks. Configurações especiais de proxy existentes apenas no transporte do host não são automaticamente herdadas pelo cliente HTTPS Node. Não existe patch global de `fetch` nem alteração no executável.

Outros providers recebem a preservação do replay e a contenção de saídas novas. Headers, roteamento e limites do catálogo são específicos a Go/Zen. A data de possível rejeição no e-mail do Go não foi presumida como política idêntica do Zen.

## Orçamentos e limites reais

- Prévia interna: alvo de 5.000 caracteres, acrescido de envelope e ponteiro; não equivale a tokens.
- Hook de resultado: reduz texto novo quando o resultado serializado supera 6.000 caracteres, usando início/fim e arquivo completo. Skills, anexos e metadados necessários são preservados; não é teto universal do pedido HTTP.
- Catálogo Go/Zen: reduz contextos maiores para 96.000; reduz limite de input, quando presente, até esse valor e output até 16.384 nesses modelos. O host decide o momento da compactação. Não cortamos argumentos nem pares tool-call/tool-result registrados.
- HTTP: corpo máximo de 32 MiB para proteção de memória, não orçamento de tokens.
- Diagnóstico: até 64 amostras recentes e observação de prefixos em até 128 sessões; sem conteúdo bruto do prompt.

Compactação legítima, troca de modelo/ferramentas, expiração e política do serviço podem alterar o cache. `prefixChanges` indica mudança observada de estrutura, não prova cache bust nem atribui culpa ao provider. Um cache miss inicial após reinício/compactação pode ocorrer.

Não existe evidência para afirmar que remover `dist/` do Git economizará 500 mil tokens, que um BOM sozinho invalida cache ou que `git diff --stat` envia todo o bundle ao modelo. Arquivos em disco influenciam tokens quando seu conteúdo entra no payload. O plugin não despeja a pasta de sessões no prompt.

## Critério de aceite no ambiente de Carlos

Instalar, reiniciar e fazer dois turnos normais na mesma sessão Go. `validate-opencode2.ps1` distingue integridade, plugin ativo, headers no tráfego encaminhado e cache reportado por eventos nativos da geração instalada. Sem evidência, retorna pendente. Esses testes não medem economia paga nem garantem ausência de futuros e-mails.

## Referências

- [API de plugins e configuração Beta](https://opencode.ai/v2/docs/plugins/).
- [Compactação nativa Beta](https://opencode.ai/v2/docs/compaction/).
- [OpenCode Go](https://opencode.ai/docs/go/).

SDK de build: `0.0.0-beta-18743`. O ZIP Beta anterior contém uma condição específica `agentID === "adv"`; não foi comprovado como o commit do executável atual e não foi recompilado ou distribuído aqui.
