# OpenCode AI-Driven Engineering

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
                               │                 │
                        tracker-operator
                     GitHub/Jira/Linear
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


## v4.2.2 — Runtime-validated release

A v4.2.2 congela a linha v4.2 sobre a regressão completa executada em Windows/OpenCode V2 e um smoke read-only real de GitHub Projects. O release não cria ou altera work items externos durante essa validação; Jira e Linear permanecem certificados por contrato até seu primeiro uso autorizado.

## v4.2.1 — Controlled project execution

A v4.2.1 adiciona duas bordas de execução sem ampliar shell genericamente:

- `git-readonly.ps1` fornece metadata Git cross-workspace por ações tipadas, evitando o mismatch de permissions causado por comandos raw como `git -C <repo> log ...`.
- `run-project-check.ps1` executa checks específicos/containerizados apenas quando registrados em `.ai/execution-policy.json` e explicitamente autorizados.
- `register-project-check.ps1` é a ferramenta administrativa para registrar esses checks.
- `verifier` usa o wrapper; `docker run*` amplo continua proibido.
- `scripts/bootstrap-project.ps1` existe novamente como compatibility shim e encaminha para `runtime/bootstrap-project.ps1`.

O deny que motivou esse hardening foi observado numa instalação anterior à v4.2; portanto esta release trata o caso como evidência de design/ergonomia, não como regressão comprovada da v4.2.0.

## v4.2 — Work Management + Traceability + Evidence Hardening

A v4.2 transforma a agnosticidade de tracker em uma camada operacional:

- `project-manager` decide Delivery; `tracker-operator` executa sincronização externa.
- providers suportados: **GitHub Projects/Issues via `gh`**, **Jira Cloud via REST API v3** e **Linear via GraphQL**.
- `.ai/integrations.json` contém apenas configuração não secreta.
- `.ai/traceability.json` liga work item -> issue -> branch -> commit -> PR -> evidence.
- `.ai/audit.jsonl` registra eventos estruturados com redaction de tokens conhecidos.
- tracker externo não substitui gates internos.
- por padrão, estado externo terminal exige `global_status == DONE`.
- runtime smoke faz assertion dura de `default_agent=orchestrator` e `subagent_depth=2`.
- `run-regression.ps1` executa a regressão com preservação explícita de exit codes.
- `verify-git-push.ps1` valida `HEAD local == remote branch SHA`.




## Correção v4.1.3 — package version source of truth

A versão exibida pelo instalador e gravada no manifesto vem exclusivamente do arquivo `VERSION`. O instalador falha cedo se `VERSION` estiver ausente, vazio ou fora do formato esperado, evitando drift entre release, banner e manifesto.

## Correção v4.1.1 — config migration gate

A v4.1.1 corrige a migração real observada de `experimental.subagent_depth` para `subagent_depth` na raiz. Quando `experimental` fica vazio, o objeto inteiro é removido. O instalador detecta `opencode2`/`opencode`, faz preflight da configuração candidata e só conclui a instalação se `debug config` passar. Se a validação pós-escrita falhar, a configuração anterior é restaurada e o manifesto não é gravado.

## Correção v4.1 — routing enforcement

A v4.1 transforma o grafo de agentes em política de execução: Orchestrator e Engineer operam em `DELEGATE_FIRST`, não pedem confirmação para delegação interna já permitida, não devolvem trabalho manual ao usuário quando o runtime pode executá-lo e só declaram `ROUTING_BLOCKED` após falha/deny real de uma chamada. O Engineer usa `explorer` como default de discovery material e delega mutação a `implementer`, com evidência independente via `verifier`/review conforme risco.

Isso corrige o padrão em que o modelo entendia a arquitetura, explicava qual agente deveria atuar, mas esperava o usuário mandar explicitamente “invoque os agents”.

## O que mudou na v4

- `subagent_depth: 2` corrigido para o **nível raiz** da configuração V2.
- `AGENTS.md` global recebe um bloco gerenciado com invariantes persistentes.
- Os 17 agents usam **deny-all + allowlist**, incluindo `tracker-operator` como leaf do Delivery Plane.
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
├── execution-policy.json
├── integrations.json
├── traceability.json
├── audit.jsonl
├── work-items/
└── delegations/
```

Em `LEAN`, Product e Delivery começam como `required: false`. Em `STANDARD` e `HIGH_ASSURANCE`, os três planos começam requeridos.

Compatibilidade: o caminho legado `scripts/bootstrap-project.ps1` continua aceito no pacote v4.2.2 e apenas encaminha para o runtime, emitindo aviso de depreciação. Prefira o caminho em `runtime/`.

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

Quando work management externo estiver configurado, o Project Manager delega operações ao `tracker-operator`; ele não decide escopo, prioridade, sequencing ou acceptance.

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


## Git cross-workspace e project checks

Metadata Git de outro repositório/worktree deve usar o wrapper tipado:

```powershell
pwsh -File ./runtime/git-readonly.ps1 -ProjectRoot C:\repo -Action log -MaxCount 20
pwsh -File ./runtime/git-readonly.ps1 -ProjectRoot C:\repo -Action status
```

Ações suportadas: `status`, `log`, `rev-parse`, `branch`, `diff-stat`, `diff-names`. Não há shell livre nem `git show` de conteúdo.

Para testes/checks específicos do projeto, bootstrap cria `.ai/execution-policy.json` com `authorized: false`. Registre um check e revise antes de autorizar:

```powershell
pwsh -File ./runtime/register-project-check.ps1 `
  -ProjectRoot . `
  -Name feature-docker `
  -Runner docker `
  -Image qb-validate-php:8.3 `
  -Network qb-net `
  -ProjectMountTarget /app `
  -ContainerWorkdir /app `
  -Command vendor/bin/phpunit,-c,phpunit.xml-dist `
  -AuthorizePolicy
```

Depois o `verifier` pode executar:

```powershell
pwsh -File ./runtime/run-project-check.ps1 -ProjectRoot . -Name feature-docker
```

O wrapper Docker constrói `docker run --rm` a partir de campos estruturados. `network=host` é proibido, não há flags arbitrárias, e mount `rw` exige `allow_workspace_writes=true` na policy revisada. Nenhum agent recebe `docker run*` amplo.

## Work Management adapters

Bootstrap cria `.ai/integrations.json` com `provider: "none"`. Configure apenas metadados não secretos.

### GitHub Projects / Issues

```json
{
  "work_management": {
    "provider": "github",
    "github": {
      "owner": "org-ou-user",
      "repository": "repo",
      "project_owner": "org-ou-user",
      "project_number": 1,
      "status_field": "Status",
      "done_status": "Done"
    }
  }
}
```

Auth é gerida pelo `gh auth`; para Projects o token precisa de acesso ao escopo de Projects.

### Jira Cloud

Configure `base_url`, `project_key` e `issue_type`. Auth usa as env vars `JIRA_EMAIL` e `JIRA_API_TOKEN` por padrão. Os valores nunca entram em `.ai/`.

### Linear

Configure `team_id`; `project_id` é opcional para vincular novos issues a um Project. Auth usa `LINEAR_API_KEY` por padrão; `auth_scheme` pode ser `api-key` ou `bearer`.

Operações:

```powershell
pwsh -File ./runtime/work-management.ps1 -ProjectRoot . -Action discover
pwsh -File ./runtime/work-management.ps1 -ProjectRoot . -Action create -Title "Nova feature" -Body "..."
pwsh -File ./runtime/work-management.ps1 -ProjectRoot . -Action transition -ExternalId KEY-123 -Status "In Progress"
pwsh -File ./runtime/work-management.ps1 -ProjectRoot . -Action link-pr -ExternalId KEY-123 -Url https://...
```

Ações disponíveis: `discover`, `list`, `get`, `create`, `update`, `comment`, `transition`, `link-pr`, `sync`. `sync` usa o work item normalizado em `.ai/work-items/<id>.json`.

## Traceability e audit

```powershell
pwsh -File ./runtime/traceability.ps1 -ProjectRoot . -Action link-branch -Value feat/WORK-001
pwsh -File ./runtime/traceability.ps1 -ProjectRoot . -Action link-commit -Value <sha>
pwsh -File ./runtime/traceability.ps1 -ProjectRoot . -Action link-pr -Provider github -Url <url>
pwsh -File ./runtime/audit-log.ps1 -ProjectRoot . -EventType delivery.sync -Plane delivery -Status OBSERVED
```

O audit log registra que uma ação aconteceu; ele não prova correção funcional.

## Evidence hardening e regressão

```powershell
pwsh -File ./runtime/run-regression.ps1
```

Validação de push:

```powershell
pwsh -File ./runtime/verify-git-push.ps1 -ProjectRoot . -Remote origin -Audit
```

Esse comando só retorna `PUSH_VALIDATED` quando o SHA de `HEAD` for exatamente o SHA da branch remota.


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

## Runtime compatibility note — v4.1.2

This package targets OpenCode V2. Runtime validation prefers `opencode2` and only falls back to `opencode` when `opencode2` is unavailable. This avoids false failures on machines that have both a V1 `opencode` CLI and the V2 `opencode2` CLI installed.


## Referências de providers

- GitHub CLI Projects: https://cli.github.com/manual/gh_project
- Jira Cloud REST API v3: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
- Linear GraphQL API: https://linear.app/developers/graphql
