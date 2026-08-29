# Validation Report — v4.2.2

Gerado em 2026-08-29 durante a montagem do pacote.

| Resultado | Check | Detalhe |
|---|---|---|
| PASS | Quantidade de arquivos | 87 arquivos |
| PASS | 17 agents | 4 control + 1 Delivery operator + 12 Engineering specialists |
| PASS | Policies de agents | deny-all; sem external_directory allow; leaf agents sem ask/subagent |
| PASS | Work Management authority | PM -> tracker-operator; tracker execution-only |
| PASS | Providers | GitHub Projects/Issues, Jira Cloud REST v3, Linear GraphQL |
| PASS | Secret handling | tokens não são persistidos em templates; env/gh auth |
| PASS | Traceability | issue -> branch -> commit -> PR -> evidence |
| PASS | Audit | JSONL estruturado + redaction de tokens conhecidos |
| PASS | External terminal gate | estado terminal exige Global DONE por padrão |
| PASS | Runtime invariants | default_agent=orchestrator e subagent_depth=2 são assertions |
| PASS | Regression runner | exit codes preservados e failure gate explícito |
| PASS | Push proof | local HEAD comparado com SHA remoto |
| PASS | SKILL progressive disclosure | 195 linhas |
| PASS | JSON templates | parseáveis |
| PASS | UTF-8 | arquivos textuais revisados |

## Evidência executada da release v4.2.2

- `runtime/run-regression.ps1` executou os 13 grupos previstos e retornou `REGRESSION_OK` no Windows.
- `runtime/runtime-smoke.ps1` confirmou OpenCode V2, `default_agent=orchestrator` e `subagent_depth=2`.
- `runtime/work-management.ps1 -Action discover` acessou GitHub Projects via `gh`, sem criar, editar ou mover objetos externos.
- `runtime/verify-git-push.ps1 -Audit` confirmou que HEAD local e SHA remoto coincidem.

Jira e Linear permanecem validados por contrato e testes determinísticos. Sua integração real depende de um projeto autorizado e das credenciais do provider correspondente.

## Evidência arquitetural v4.2/v4.2.1

- `project-manager` decide Delivery; `tracker-operator` apenas materializa decisões.
- `.ai/control.json` continua canônico para gates.
- `.ai/integrations.json` não contém credenciais.
- `.ai/traceability.json` e `.ai/audit.jsonl` mantêm rastreabilidade sem criar acceptance.
- status externo terminal não pode contornar o Triple DoD.
- `verify-git-push.ps1` somente emite `PUSH_VALIDATED` quando HEAD local e SHA remoto coincidem.


## v4.2.1 checks

- `tests/git-readonly.tests.ps1`: Git metadata em worktree fora do Location sem `git -C` raw no agent.
- `tests/project-check-policy.tests.ps1`: `authorized=false` bloqueia; Docker estruturado passa; `network=host` e `rw` sem opt-in bloqueiam.
- `tests/legacy-bootstrap-shim.tests.ps1`: caminho legado `scripts/bootstrap-project.ps1` continua funcional por forwarding e cria `execution-policy.json` não autorizado por default.
- static policy proíbe `docker run*` amplo e exige wrappers nos agents relevantes.

Os testes PowerShell/runtime foram executados no ambiente real desta release antes de marcar a linha v4.2.2 como runtime-VALIDATED.
