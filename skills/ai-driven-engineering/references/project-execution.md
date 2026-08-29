# Project execution wrappers

## Objetivo
Permitir discovery Git cross-workspace e verificação específica/containerizada sem transformar `engineer`/`verifier` em agents com shell irrestrito.

## Git read-only
Use `runtime/git-readonly.ps1` para metadata Git de um worktree cujo diretório não é o Location ativo. O wrapper não aceita shell livre nem `git show` de conteúdo. Ações: `status`, `log`, `rev-parse`, `branch`, `diff-stat`, `diff-names`.

O fluxo normal continua `engineer -> explorer`; o wrapper apenas remove a necessidade de `git -C ...` raw, cujo comando completo pode não casar com allowlists como `git log*`.

## Project checks
`.ai/execution-policy.json` nasce com `authorized: false`. A autorização é humana e explícita. Custom agents não devem alterar essa policy.

`runtime/run-project-check.ps1 -Name <check>` executa somente checks registrados com `owner=verifier` e `non_destructive=true`. Runners suportados:
- `process`: executável direto, sem shell interpreter; working directory deve ficar dentro do projeto.
- `docker`: `docker run --rm` construído pelo runtime a partir de campos estruturados; `network=host` é proibido, não há flags arbitrárias e o único bind mount é o ProjectRoot para o target configurado.

Mount `rw` exige `allow_workspace_writes=true` na policy revisada. O default é `ro`.

Não adicione `docker run*` como permission ampla. Se um check necessário não estiver registrado/autorizado, reporte `PARENT_EXECUTION_REQUIRED` para configuração da policy, não para execução manual repetitiva.

## Registro
Use `runtime/register-project-check.ps1` como ferramenta administrativa/humana para escrever a entrada estruturada. Esse script não é permitido a leaf agents.
