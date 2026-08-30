# Changelog

## 4.2.3 — 2026-08-29

Patch derivado diretamente do commit `1d0814dd3aaceb88f4153f6de038fd570b0cff40` (tag `v4.2.2`) para corrigir a divergência entre `subagent_depth` configurado e nesting efetivo observada em `project-manager -> tracker-operator`.

### Fixed
- Mantém `subagent_depth: 2` na raiz como configuração canônica.
- `project-manager` e `engineer` passam a declarar `subagent_depth: 2` no frontmatter como defesa em profundidade.
- Em `opencode2` beta, o installer monta `root=2 + experimental.subagent_depth=2` quando o próprio CLI aceita essa forma; o modo efetivamente instalado é registrado no manifesto.
- `runtime-smoke.ps1` deixa de confundir configuração aceita com nesting validado: emite `SUBAGENT_DEPTH_CONFIGURED`; `SUBAGENT_DEPTH_VALIDATED` exige prova comportamental.
- Corrige a disciplina de evidência da v4.2.2: o smoke GitHub Projects não é considerado validado enquanto `project-manager -> tracker-operator -> work-management discover` não concluir numa sessão nova.
- O probe nested usa sandbox temporário vazio, JSONL/exports estruturais e nonce por execução; texto de prompt ou transcript não é aceito como prova de handoff.
- O probe nested permite somente `skill(ai-driven-engineering)` como prerequisite não mutante opcional, porque os próprios agents podem ser obrigados a carregar a skill antes da delegação; qualquer outra tool continua bloqueando o gate.
- Upgrade sem mudança de config preserva os metadados de uninstall no manifesto e atualiza somente `config.subagent_depth_mode`.
- O installer não executa mais probe nested inline: a prova operacional só pode ser rodada após reiniciar ou abrir uma sessão nova.

### Added
- `runtime/nested-delegation-smoke.ps1`: prova real `orchestrator -> project-manager -> tracker-operator`, incluindo evidência da child session antes de emitir `SUBAGENT_DEPTH_VALIDATED`.
- `tests/subagent-depth-compat.tests.ps1`: cobre `dual-root+experimental` em beta compatível e fallback `canonical-root` quando o mirror é rejeitado.
- `tests/nested-delegation-smoke.tests.ps1`: usa CLI fake para validar parser estrutural, isolamento/cleanup do sandbox e rejeição de markers presentes apenas em prompt/input.
- Static policy exige `subagent_depth: 2` nos dois owners que criam leaf agents.
- Full regression passa a ter 15 grupos.

### Runtime evidence required
Para fechar esta release no ambiente real: reinstalar, reiniciar/reabrir o OpenCode, executar `nested-delegation-smoke.ps1` numa sessão nova e só depois repetir o smoke read-only de GitHub Projects. `debug config` sozinho não prova nesting.

## 4.2.2 — 2026-08-29

Release imutável derivada de `4aec5ac`, após validação runtime completa em Windows/OpenCode V2.

### Fixed
- `set-ai-state.ps1` usa interpolação `${Plane}` válida para mensagens de transição PowerShell.
- `run-regression.ps1` preserva o gate por exit code quando testes exercitam falhas deliberadas no stderr.
- Harnesses de state machine, work management terminal e project checks capturam corretamente falhas esperadas.
- Mensagem de bootstrap de project checks não fixa uma versão de pacote.

### Validation
- `run-regression.ps1`: 13 grupos de regressão executados com `REGRESSION_OK`.
- `runtime-smoke.ps1`: OpenCode V2, `default_agent=orchestrator` e `subagent_depth=2` validados.
- GitHub Projects: `work-management.ps1 -Action discover` executado contra um Project configurado, sem mutação externa.
- Jira e Linear permanecem validados por contrato; não foram chamados contra providers reais nesta release.

## 4.2.1 — 2026-08-29

Patch release de ergonomia segura para shell, informado por um `Permission denied: shell` observado **antes da v4.2**. Não é uma regressão comprovada da v4.2.0.

### Added
- `runtime/git-readonly.ps1`: metadata Git cross-workspace sem shell livre (`status`, `log`, `rev-parse`, `branch`, `diff-stat`, `diff-names`).
- `runtime/run-project-check.ps1`: execução de checks humanos pré-autorizados por `.ai/execution-policy.json`.
- `runtime/register-project-check.ps1`: ferramenta administrativa para registrar checks `process` ou `docker`.
- `.ai/execution-policy.json` nasce com `authorized: false`; workers não podem alterá-lo.
- `scripts/bootstrap-project.ps1` volta como compatibility shim e encaminha para `runtime/bootstrap-project.ps1`.
- regressões para Git cross-workspace, policy de checks e bootstrap legado.

### Security / Routing
- `engineer`, `explorer` e `verifier` usam wrapper para Git metadata cross-workspace em vez de `git -C ...` raw.
- `verifier` pode executar checks específicos/containerizados somente pelo wrapper estruturado.
- nenhum agent recebe `docker run*` amplo. Docker `network=host` é rejeitado; mount `rw` exige opt-in explícito na policy humana.
- `implementer` recebe deny explícito para `.ai/execution-policy.json`.

### DeepSeek review incorporated
- Mantido o diagnóstico correto de que o deny observado podia ser consequência do raw command não casar com a allowlist e de que o Engineer deve delegar antes de hand-back.
- Não adotada a sugestão ampla de liberar `docker run*`; na v4.2 o Verifier já permite `phpunit*`/`vendor/bin/phpunit*`, e checks Docker passam por wrapper controlado.

## 4.2.0 — 2026-08-29

Minor release consolidating the path to a production-grade AI Engineering Operating Model with explicit Work Management, end-to-end traceability, auditability and evidence hardening.

### Work Management
- Adds `tracker-operator` as a leaf Delivery subagent under `project-manager`.
- Adds provider abstraction for GitHub Issues/Projects (`gh`), Jira Cloud REST API v3 and Linear GraphQL.
- Adds `.ai/integrations.json` for non-secret provider configuration.
- Adds normalized `.ai/work-items/*.json` state and `sync` operation.
- External terminal status is blocked by default until `.ai/control.json.global_status == DONE`.

### Traceability & observability
- Adds `.ai/traceability.json` linking external issue, branch, commit, PR and evidence.
- Adds `.ai/audit.jsonl` structured execution journal with known-token redaction.
- State transitions now append audit events.
- Adds `traceability.ps1` and `audit-log.ps1`.

### Evidence hardening
- `runtime-smoke.ps1` now hard-fails when `default_agent != orchestrator` or `subagent_depth != 2`.
- Adds `run-regression.ps1` with explicit exit-code preservation.
- Adds `verify-git-push.ps1` to require local HEAD == remote branch SHA before `PUSH_VALIDATED`.
- `run-evals.ps1` now preserves the OpenCode process exit code before writing output.

### Tests
- Adds Work Management contract and terminal-gate tests.
- Adds traceability/audit tests.
- Adds evidence-hardening tests.
- Package layout now expects 17 agents.
- CI runs new coverage on Windows, Linux and macOS.

### Security
- Tracker credentials remain outside `.ai/`: GitHub uses `gh auth`; Jira and Linear use environment variables.
- `tracker-operator` has no direct edit permission and can execute only controlled runtime scripts.
- External tracker state never creates Product, Delivery, Engineering or Global acceptance.

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
