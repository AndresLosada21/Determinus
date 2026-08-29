# Changelog

## 4.1.0 — 2026-08-29

### Routing enforcement
- Orchestrator agora usa `DELEGATE_FIRST` e deve invocar PO/PM/Engineer em vez de apenas recomendar a delegação.
- Proibido hand-back de comandos/testes ao usuário quando tools/subagents permitidos podem executar.
- Delegação interna permitida não exige confirmação humana.
- `ROUTING_BLOCKED` requer ausência real da capability ou tentativa com erro/deny.
- Engineer usa `explorer` como default de discovery material e delega implementação/verificação aos specialists owners.
- Adicionados `references/routing-enforcement.md` e evals contra “roteiro em vez de execução”.
- Static policy passa a verificar invariantes de routing nos control agents.

## 4.0.0 — 2026-08-29

### Architecture hardening
- Mantém os quatro papéis de controle: `orchestrator`, `product-owner`, `project-manager`, `engineer`.
- Mantém 12 especialistas de Engenharia, agora com roteamento por profiles e fan-out limitado por política.
- Introduz estado canônico `.ai/control.json` e Triple DoD derivado de planos aplicáveis.
- Introduz Delegation Contract tipado e escalation statuses.

### OpenCode V2
- Move `subagent_depth` de `experimental.subagent_depth` para `subagent_depth` na raiz.
- Adiciona bloco gerenciado de `AGENTS.md` global para invariantes persistentes.
- Cada agent carrega explicitamente a skill em trabalho não trivial porque child sessions têm contexto novo.
- Remove dependência de `ask` em specialists de profundidade 2.

### Security
- Reescrita das permissions com deny-all inicial.
- Remove `external_directory: * allow`.
- Remove `shell *` do Project Manager e demais papéis não mutadores.
- Implementer não pode `git push`, instalar dependências arbitrariamente ou usar shell genérico.
- Remove `patch-permissions.ps1`.

### Deterministic runtime
- `runtime/bootstrap-project.ps1`
- `runtime/set-ai-state.ps1`
- `runtime/validate-ai-state.ps1`
- `runtime/static-policy-check.ps1`
- `runtime/runtime-smoke.ps1`
- `runtime/run-evals.ps1`

### Testing
- Testes de layout, permissions, máquina de estados e install/uninstall.
- CI matrix para Windows, Linux e macOS.
- Behavioral eval scenarios + rubric.

### Installer
- Instala agents, skill, runtime e ambient invariants.
- Preserva providers/MCPs/config existente via patch JSONC.
- Manifest schema v4 registra hashes e backups relevantes.
- Uninstall restaura config anterior somente quando não houve alteração posterior do usuário.

## 3.x
Versões anteriores estabeleceram a separação Product / Delivery / Engineering, Triple DoD, evidence states e o Engineering Lead como coordenador de especialistas. A v4 endurece essas ideias no runtime e nos testes.
