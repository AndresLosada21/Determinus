# Execution Policy

Profile: STANDARD

## Human-reviewed machine policy
O arquivo `.ai/execution-policy.json` é a policy machine-readable usada por `run-project-check.ps1`. Ele nasce com `authorized: false` e não deve ser modificado por workers de implementação. Revise os checks antes de autorizar.

Use `runtime/register-project-check.ps1` para registrar um check de forma estruturada. O owner padrão é `verifier`; use `-Owner debugger` somente para checks diagnósticos não destrutivos. Checks `debugger` produzem `OBSERVADO`/`DIAGNOSTIC_CHECK_COMPLETED` e nunca `VALIDADO`.

## Approved project commands
Documente aqui a intenção e contexto humano dos checks esperados para este repositório. Este Markdown é explicativo; o JSON é a fonte executável.

- test:
- lint:
- build:
- format:
- migrations:

## Forbidden / high-risk actions
- destructive filesystem operations
- credential/secret access
- git push/force-push
- produção/deploy sem autoridade explícita
- `docker run*` genérico em agent permissions
- privileged containers, host network ou host/device mounts fora do wrapper estruturado
