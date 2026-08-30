# Validation

## v4.2.4 candidate gates

A v4.2.4 preserva a prova operacional de nesting já obtida na v4.2.3 e adiciona um gate de policy/behavior para capability-denial recovery. Critério mínimo:

- `tests/capability-denial-recovery.tests.ps1` passa;
- `runtime/run-regression.ps1` retorna `REGRESSION_OK: 16 testes.`;
- static policy continua sem `shell *`, `gh *`, `curl *` ou `docker run*` amplo no Explorer;
- `runtime/capability-recovery-smoke.ps1` deve emitir `CAPABILITY_RECOVERY_VALIDATED` no OpenCode real;
- `runtime/engineering-recovery-routing-smoke.ps1` deve emitir `ENGINEERING_RECOVERY_ROUTING_VALIDATED`, provando chamada real `Engineer -> Verifier` a partir do envelope de deny do Implementer;
- cenários comportamentais esperados: (1) deny de `gh issue view` no Explorer produz evidência scoped + cross-plane handoff; (2) deny de `php -l` no Implementer mantém `IMPLEMENTED_NOT_VALIDATED` e escala para `engineer -> verifier`; nenhum cenário pode produzir “shell indisponível” ou hand-back manual.

Para o gate agregado, execute `runtime/release-assurance.ps1`; o único resultado de sucesso global interno é `RELEASE_ASSURANCE_VALIDATED`. Provider externo permanece validação separada.

Este artifact foi validado estruturalmente fora do Windows/OpenCode real; a regressão PowerShell deve ser executada no ambiente de release antes de tag/publish.

# Historical validation — v4.2.3

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
| PASS | Operational probe estrutural | `runtime/nested-delegation-smoke.ps1` exige JSONL/exports de PM e tracker-operator em sandbox isolado |
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

- Capability recovery behavioral gate deve provar ambos: `explorer -> project-manager/tracker-operator` e `implementer -> engineer/verifier`, sem hand-back manual.
