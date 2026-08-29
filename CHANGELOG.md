# Changelog

## 4.1.3 — 2026-08-29

Patch release focused on release metadata correctness discovered during real installation validation.

### Fixed
- `install-opencode.ps1` no longer hardcodes `4.1.1`; `VERSION` is now the single source of truth for the installer banner and installation manifest.
- Installer aborts if `VERSION` is missing, empty, or malformed.
- README title no longer embeds a stale package version.

### Tests
- Installer integration now verifies that the manifest `package_version` matches the repository `VERSION`.

## 4.1.2 — 2026-08-29

Patch release based on runtime validation against a real OpenCode V2 installation.

### Fixed
- `runtime/runtime-smoke.ps1` now prefers `opencode2` and falls back to `opencode` only when V2 CLI is unavailable.
- Runtime smoke no longer falsely reports a valid V2 config as invalid by invoking an installed V1 `opencode` binary first.
- `runtime/static-policy-check.ps1` now uses `${name}: ...` interpolation so PowerShell does not parse `$name:` as a drive-qualified variable reference.

### Tests
- Added `tests/runtime-smoke-cli.tests.ps1` to prevent regression in CLI precedence and PowerShell interpolation.

## 4.1.1 — 2026-08-29

Patch release focused on the real migration failure observed on Windows/OpenCode V2.

### Fixed
- Removes the top-level `experimental` object when legacy `experimental.subagent_depth` was its only property.
- Adds candidate config preflight through the installed OpenCode CLI before mutating the target.
- Detects `opencode2` first and falls back to `opencode`.
- Makes `debug config` a hard gate when a CLI is available.
- Restores the exact previous config and aborts with `INSTALLATION_FAILED` if post-write validation fails.
- Does not write the installation manifest after a failed runtime config gate.
- Installer output now reports the actual package version from `VERSION`.

### Tests
- Added regression coverage for legacy configs containing only `experimental.subagent_depth`.
- Added runtime gate rollback coverage with a synthetic `opencode2`.
- CI now runs the rollback test on Windows, Linux, and macOS.

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
