# Validation — v4.2.3

Base de origem: commit `1d0814dd3aaceb88f4153f6de038fd570b0cff40` (`v4.2.2`).

## Validação estrutural deste artefato

| Resultado | Check | Detalhe |
|---|---|---|
| PASS | Layout de pacote | arquivos obrigatórios presentes no teste de layout |
| PASS | 17 agents | 4 control + 1 Delivery operator + 12 Engineering specialists |
| PASS | Nested owners | `project-manager` e `engineer` declaram `subagent_depth: 2` |
| PASS | Config canônica | root `subagent_depth: 2` preservado |
| PASS | Compatibilidade beta | installer possui candidato `dual-root+experimental` condicionado ao `opencode2` beta + preflight |
| PASS | Manifest evidence | registra `config.subagent_depth_mode` |
| PASS | Operational probe estrutural | `runtime/nested-delegation-smoke.ps1` exige JSONL/exports de PM e tracker-operator em sandbox isolado; só `skill(ai-driven-engineering)` é tolerada como prerequisite não mutante |
| PASS | Regression contract | runner inclui `nested-delegation-smoke.tests.ps1` e totaliza 15 grupos |
| PASS | Least privilege | não adiciona `docker run*`, shell irrestrito ou bypass de owner |
| PASS | Evidence semantics | `CONFIGURED != VALIDATED`; nested runtime é obrigatório para `SUBAGENT_DEPTH_VALIDATED` |

## Correção de evidência da v4.2.2

A v4.2.2 declarou GitHub Projects validado, porém evidência posterior mostrou que `project-manager -> tracker-operator` foi bloqueado com `Subagent depth limit reached (1)` antes de `work-management.ps1 -Action discover`. A v4.2.3 reclassifica corretamente o provider como **NOT_VALIDATED** até que o nested probe e o discover delegado passem em uma sessão nova.

## O que precisa ser executado no Windows/OpenCode real

1. Instalar a v4.2.3 e confirmar no manifesto `package_version=4.2.3` e `subagent_depth_mode`.
2. Reiniciar o serviço/OpenCode ou iniciar uma sessão totalmente nova.
3. Executar `runtime/run-regression.ps1`; esperado: `REGRESSION_OK: 15 testes.`
4. Executar `runtime/nested-delegation-smoke.ps1`; esperado: `NESTED_DELEGATION_OK` + `SUBAGENT_DEPTH_VALIDATED`.
5. Somente depois repetir `project-manager -> tracker-operator -> work-management.ps1 -Action discover` contra GitHub Project 4.

Este ambiente de empacotamento não possui `pwsh`, `powershell` ou `opencode2`; portanto os testes PowerShell/model-driven não são alegados como executados aqui.
