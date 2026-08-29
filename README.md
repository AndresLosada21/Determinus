# OpenCode AI-Driven Engineering v4.1.1

Um **AI-Driven Engineering Operating Model para OpenCode V2**: stack/model/provider agnostic, com separação explícita entre Produto, Entrega e Engenharia, subagents especializados, contratos persistentes, permissions com least privilege, gates e estado canônico validável.

## Arquitetura

```text
                         ┌──────────────────┐
                         │   orchestrator   │
                         │ coordena gates   │
                         └────────┬─────────┘
                  ┌───────────────┼────────────────┐
                  ▼               ▼                ▼
          product-owner    project-manager      engineer
          WHY / WHAT       WHEN / ORDER         HOW
                                                │
                       ┌────────────────────────┼──────────────────────┐
                       ▼                        ▼                      ▼
                  discovery/design        implementation         validation
                  explorer/researcher      tester/implementer    verifier/reviewer/...
```

Autoridade não é hierarquia de cargo: cada plano tem decisões que os outros não podem sobrescrever.

- **Product**: outcome, escopo, critérios, Product Acceptance.
- **Delivery**: readiness, dependências, ondas, Delivery Acceptance.
- **Engineering**: design técnico, execução, evidência, Engineering Acceptance.
- **Orchestrator**: handoffs, contradições e gate global.

`implemented != validated != ENGINEERING_ACCEPTED != DELIVERY_ACCEPTED != PRODUCT_ACCEPTED`.



## Correção v4.1.1 — config migration gate

A v4.1.1 corrige a migração real observada de `experimental.subagent_depth` para `subagent_depth` na raiz. Quando `experimental` fica vazio, o objeto inteiro é removido. O instalador detecta `opencode2`/`opencode`, faz preflight da configuração candidata e só conclui a instalação se `debug config` passar. Se a validação pós-escrita falhar, a configuração anterior é restaurada e o manifesto não é gravado.

## Correção v4.1 — routing enforcement

A v4.1 transforma o grafo de agentes em política de execução: Orchestrator e Engineer operam em `DELEGATE_FIRST`, não pedem confirmação para delegação interna já permitida, não devolvem trabalho manual ao usuário quando o runtime pode executá-lo e só declaram `ROUTING_BLOCKED` após falha/deny real de uma chamada. O Engineer usa `explorer` como default de discovery material e delega mutação a `implementer`, com evidência independente via `verifier`/review conforme risco.

Isso corrige o padrão em que o modelo entendia a arquitetura, explicava qual agente deveria atuar, mas esperava o usuário mandar explicitamente “invoque os agents”.

## O que mudou na v4

- `subagent_depth: 2` corrigido para o **nível raiz** da configuração V2.
- `AGENTS.md` global recebe um bloco gerenciado com invariantes persistentes.
- Todos os 16 agents foram reescritos com **deny-all + allowlist**.
- `external_directory: allow` global foi eliminado.
- `project-manager` não possui mais `shell *`.
- especialistas de profundidade 2 não usam `ask`; ações não permitidas retornam `PARENT_EXECUTION_REQUIRED`.
- `patch-permissions.ps1` foi removido.
- `.ai/control.json` é o estado canônico; `set-ai-state.ps1` aplica transições e `validate-ai-state.ps1` valida gates.
- contratos continuam Markdown, mas não são mais a única fonte de verdade de estado.
- delegação tipada e profiles `LEAN`, `STANDARD`, `HIGH_ASSURANCE`.
- fan-out operacional padrão limitado a 3 especialistas por onda.
- smoke test de runtime e behavioral eval harness.
- CI preparada para Windows, Linux e macOS.
- uninstall v4 restaura config/AGENTS.md quando é seguro e preserva alterações posteriores do usuário.

## Requisitos

- OpenCode V2 compatível com `permissions` V2 e `subagent_depth`.
- PowerShell 5.1+ no Windows ou PowerShell 7 (`pwsh`) em qualquer plataforma.
- um provider/model configurado no OpenCode para executar os agents.

A v4 não fixa provider nem modelo nos agents: eles herdam a seleção/configuração do OpenCode.

## Instalação

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\install-opencode.ps1
```

### Linux / macOS

```bash
pwsh -File ./install-opencode.ps1
```

O destino padrão é `~/.config/opencode`.

O instalador:

1. copia os agents para `~/.config/opencode/agents/`;
2. instala a skill em `~/.config/opencode/skills/ai-driven-engineering/`;
3. instala runtime determinístico em `~/.config/opencode/ai-driven-engineering/runtime/`;
4. faz merge não destrutivo da config e define `subagent_depth: 2` e `default_agent: "orchestrator"`;
5. adiciona um bloco gerenciado ao `AGENTS.md` global sem apagar instruções existentes;
6. cria backups antes de alterar arquivos existentes;
7. tenta `opencode debug config` quando o CLI está disponível.

Flags úteis:

```powershell
-NoDefaultAgent          # não troca default_agent
-NoConfigPatch           # não altera opencode.json/jsonc
-NoAmbientInstructions   # não altera AGENTS.md global
-SkipRuntimeCheck        # pula opencode debug config
-Force                   # permite substituir arquivos gerenciados alterados
-Target <path>           # instala em outro config dir
```

## Bootstrap de um projeto

Depois da instalação:

```powershell
pwsh -File ~/.config/opencode/ai-driven-engineering/runtime/bootstrap-project.ps1 \
  -ProjectRoot /caminho/do/projeto \
  -WorkItemId FEATURE-001 \
  -Profile STANDARD
```

Cria `.ai/` com:

```text
.ai/
├── control.json
├── product-contract.md
├── delivery-contract.md
├── engineering-contract.md
├── checkpoint.md
├── decision-log.md
├── execution-policy.md
└── delegations/
```

Em `LEAN`, Product e Delivery começam como `required: false`. Em `STANDARD` e `HIGH_ASSURANCE`, os três planos começam requeridos.

## Máquina de estados

Atualização válida:

```powershell
pwsh -File ~/.config/opencode/ai-driven-engineering/runtime/set-ai-state.ps1 \
  -ProjectRoot . \
  -Plane engineering \
  -Status READY_FOR_IMPLEMENTATION \
  -Evidence "engineering-contract.md revisado"
```

Validação:

```powershell
pwsh -File ~/.config/opencode/ai-driven-engineering/runtime/validate-ai-state.ps1 -ProjectRoot .
```

`global_status` só pode ser `DONE` quando todos os planos `required: true` estão em seu estado final de acceptance.

## Roteamento

Para trabalho end-to-end, use `orchestrator`.

Para trabalho puramente técnico, `engineer` pode ser usado como primary sem cerimônia de Produto/Delivery quando o profile for LEAN e esses planos não forem aplicáveis.

O Engineer seleciona especialistas sob demanda:

| Agent | Responsabilidade |
|---|---|
| `explorer` | fatos do repositório/runtime |
| `researcher` | pesquisa técnica autoritativa |
| `modeler` | arquitetura, fluxos, estados e contratos |
| `engineering-planner` | decomposição técnica |
| `tester` | testes/especificação executável |
| `implementer` | código/config de produto |
| `verifier` | validação independente executada |
| `debugger` | causa raiz |
| `reviewer` | correção/regressões/manutenibilidade |
| `security-reviewer` | segurança e abuso |
| `integrator` | readiness técnico |
| `documenter` | documentação durável |

## Segurança de permissions

A v4 não concede acesso a diretórios externos. Arquivos típicos de segredo são `deny` explícito. Workers aninhados não recebem `shell *`.

Allowlist de execução cobre comandos comuns de teste/build/lint/format e Git somente leitura. Quando um projeto exige outro comando, o specialist **não deve contornar a policy**: ele retorna `PARENT_EXECUTION_REQUIRED` para que o Engineering Lead/Humano decida.

Isso é intencional: a v4 prefere uma escalada explícita a um sub-subagent bloqueado em approval invisível.

## Runtime smoke

```powershell
pwsh -File ~/.config/opencode/ai-driven-engineering/runtime/runtime-smoke.ps1
```

Opcionalmente, um probe real de modelo:

```powershell
pwsh -File ~/.config/opencode/ai-driven-engineering/runtime/runtime-smoke.ps1 \
  -RunAgentProbe \
  -Model provider/model
```

O probe real consome uso do provider.

## Behavioral evals

```powershell
pwsh -File ./runtime/run-evals.ps1 \
  -ProjectRoot /caminho/do/projeto \
  -Model provider/model
```

Os cenários ficam em `runtime/evals/scenarios.jsonl` e a avaliação em `runtime/evals/RUBRIC.md`. O harness salva a saída bruta; não mascara avaliação qualitativa como teste determinístico.

## Testes do pacote

```powershell
pwsh -File ./tests/package-layout.tests.ps1
pwsh -File ./tests/static-policy.tests.ps1
pwsh -File ./tests/state-machine.tests.ps1
pwsh -File ./tests/installers.integration.ps1
```

O workflow `.github/workflows/ci.yml` roda a suíte em Windows, Ubuntu e macOS.

## Uninstall

```powershell
pwsh -File ./uninstall-opencode.ps1
```

Arquivos gerenciados que foram modificados localmente são preservados por padrão. Para a config, a v4 só restaura o backup automaticamente se o arquivo ainda tiver exatamente o hash escrito pelo instalador; se o usuário alterou a config depois, ela é preservada. O bloco da v4 em `AGENTS.md` pode ser removido de forma localizada.

## Compatibilidade de nesting

O fluxo principal é:

```text
orchestrator (depth 0)
  -> engineer (depth 1)
      -> specialist (depth 2)
```

Se a versão local do OpenCode apresentar problemas com nesting, use o fallback documentado em `skills/ai-driven-engineering/references/opencode-runtime.md`: Engineer como primary, specialists em sessões explícitas usando Delegation Contracts, e Orchestrator para fechamento dos gates.

## Filosofia

A v4 não tenta fazer um prompt “parecer” uma organização. Ela transforma a organização em:

- autoridade explícita;
- permissions de runtime;
- contratos persistentes;
- estados e transições verificáveis;
- evidence discipline;
- delegações auto-suficientes;
- verificação independente;
- evals e smoke tests.

O objetivo é que as regras críticas sejam **difíceis de violar por construção**, e não apenas recomendadas em texto.
