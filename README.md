# Determinus 3.0.4

Plugin de **Spec-Driven Development + TDD** para o [OpenCode](https://opencode.ai) Beta: specs viram leis executáveis. Com o agente `determinus` selecionado, todo change atravessa 7 gates com aprovação humana no planejamento e **prova red→green obrigatória** antes de qualquer conclusão de tarefa.

## Por que existe

- Chat some; estado durável fica. Changes, gates, tarefas e evidências vivem no store — retomar uma sessão é inspecionar estado, não reler conversa.
- "Testes depois" não compila: o checkpoint **bloqueia** (`TASK_ORDERING_VIOLATION`) sem par red→green registrado via `determinus_run_test`.
- Aprovação humana onde importa: gate de planejamento exige aceite explícito; cancelamento e archive exigem evidência de aprovação.
- Custo sob controle: o agente trabalha com forma de resposta enxuta (gate ativo, resultado verificado, próxima ação) e disciplina de tokens embutida.

## Como funciona

```
proposal → discovery → design → planning → execution → acceptance → release → archive
```

| Gate | O que acontece |
|---|---|
| `proposal` | Escopo, exclusões e critérios de aceite |
| `discovery` | Evidências relevantes e unknowns explícitos |
| `design` | Direção sustentada antes de implementar |
| `planning` | Tarefas independentemente verificáveis + **aprovação humana** |
| `execution` | Checkpoint por task, só após verificação com par red→green |
| `acceptance` | Registro da verificação exigida |
| `release` | Finalização no trunk (`RELEASE_REQUIRES_TRUNK_MERGE` sem merge) |

- **TDD hard por padrão** (`strict`, configurável para `advisory`/`off`): `determinus_task_checkpoint` falha sem red→green; o gate de execução exige pareamento completo.
- **Worktrees isoladas**: mutações ADV rodam em worktrees `change/<id>`, nunca no checkout principal.
- **Sem sombra no host**: só o agente `determinus` é instalado; os agentes nativos `build`/`plan` nunca são modificados.

## Uso

Selecione o agente `determinus` e siga os comandos:

| Comando | Fase |
|---|---|
| `/determinus-proposal` | Proposta do change |
| `/determinus-discover` | Descoberta e evidências |
| `/determinus-design` | Desenho da solução |
| `/determinus-prep` | Tarefas + pedido de aprovação |
| `/determinus-apply` | Execução com checkpoints |
| `/determinus-review` | Revisão independente |
| `/determinus-harden` | Endurecimento |
| `/determinus-validate` | Validação final |
| `/determinus-archive` | Merge + push + archive (fase 9) |

Skills embutidas: `determinus-sdd` (disciplina de specs e gates) e `determinus-tdd` (ciclo red→green e evidência).

Exemplo mínimo de ciclo TDD fiscalizado:

```sh
# RED — prova que o teste falha
determinus_run_test(taskId, command="git diff --check", phase="red")  # exit 2
# ... corrige ...
# GREEN — prova que passa
determinus_run_test(taskId, command="git diff --check", phase="green") # exit 0
determinus_task_checkpoint(taskId, verification="...")                 # commita
```

Sem o par red→green, o checkpoint retorna `TASK_ORDERING_VIOLATION` em vez de commitar.

## Instalação (Windows + OpenCode Beta)

```powershell
.\install-opencode2.ps1
```

Depois **reinicie o OpenCode** (sessão aberta continua no código antigo) e valide:

```powershell
.\validate-opencode2.ps1 -Require go -Cli "C:\caminho\para\opencode2.exe"
```

Verde esperado: `pluginState: active` + `DETERMINUS_RUNTIME_AND_CACHE_OBSERVED`. Detalhes, rollback (`-Rollback`) e limites em [`INSTALL.md`](INSTALL.md).

## Validado de verdade, não só em fixture

- `beta-19151` no Windows: `active`, Go 8 observadas / 4 válidas 2xx, `repeatedSession: true`, `standalone: 0`, 18 usage steps, ~300k cache-read tokens.
- Smoke SDD ao vivo: bloqueio sem red→green, commit com red→green, transição de cancelamento, gates `execution` + `acceptance` verdes, `release` delimitado por design.
- Evidência completa em [`VALIDATION.json`](VALIDATION.json).

## Desenvolvimento

Pré-requisitos: Node.js ≥ 24, pnpm 11.

```sh
cd plugin
pnpm install --frozen-lockfile --config.manage-package-manager-versions=false
pnpm run check    # schemas + typecheck + manifests + lint + format (9 checks)
pnpm run build    # bundle + identidade de build
pnpm test         # suíte vitest
```

Antes de qualquer commit que toque arquivos cobertos, regenere o manifest **por último**:

```sh
node --import tsx scripts/write-release-manifest.ts
```

## Estrutura

- `plugin/src` — entry v2 (`index.ts`), agente, comandos como código, skills, validador TDD, tools (checkpoint, gates, worktree, archive).
- `plugin/scripts` — build, instalador transacional (`installer-core.ts`), validador e `write-release-manifest.ts`.
- `plugin/dist` — bundle compilado com dependências incorporadas (é o que o host carrega).
- `.opencode/agents/determinus.md` — manifesto do agente.
- `INSTALL.md` — instalação, validação, rollback e limites.
- `VALIDATION.json` — evidências de teste e validação live.
- `release-manifest.json` — SHA-256 de todos os arquivos do release (integridade, não assinatura).
- `AUDITORIA-ANTERIOR.md`, `TOKEN_GUARD_PLAN.md` — histórico de auditoria e diagnóstico de guarda de tokens.

## Licença

MIT — ver [`LICENSES`](LICENSES).
