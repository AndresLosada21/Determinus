# Validation Report — v4.1

Gerado em 2026-08-29 durante a montagem do pacote.

| Resultado | Check | Detalhe |
|---|---|---|
| PASS | Quantidade de arquivos | 58 arquivos |
| PASS | 16 agents | 16 encontrados |
| PASS | Policies de agents | deny-all, sem external allow, sem ask em specialists, PM sem shell * |
| PASS | SKILL progressive disclosure | 153 linhas |
| PASS | Referências da skill | todas resolvidas |
| PASS | JSON canônico | control.json válido |
| PASS | subagent_depth V2 raiz | root=2; sem experimental |
| PASS | patch-permissions removido | arquivo ausente como esperado |
| PASS | PowerShell lexical sanity | 12 scripts; delimitadores/strings balanceados |
| PASS | UTF-8 | todos os arquivos textuais legíveis em UTF-8 |

## Limitação do ambiente de empacotamento

O ambiente usado para montar este ZIP não possui `pwsh`/Windows PowerShell nem o binário `opencode`. Portanto, a suíte PowerShell e o smoke test real do OpenCode **não foram executados aqui**. O pacote inclui os testes e CI cross-platform para execução em ambiente com PowerShell, além de `runtime/runtime-smoke.ps1` para validar a instalação contra o OpenCode local.

A validação realizada aqui é estrutural/estática: YAML de agents, policies, referências da skill, JSON canônico, config fragment, UTF-8 e sanity lexical dos scripts PowerShell.

## Routing enforcement v4.1
- Orchestrator contém markers `DELEGATE_FIRST`, `FORBIDDEN_WHEN_EXECUTABLE`, `NOT_REQUIRED` e `ROUTING_BLOCKED`.
- Engineer contém os mesmos invariantes e roteamento explícito para Explorer/Implementer/Verifier.
- Behavioral evals cobrem hand-back, confirmação desnecessária e delegation-first.
