# Hardening — ADE v5.2.6 Hardened

## Princípio

`repo policy != autorização humana`. Arquivos sob controle do repositório (`.ai/*-policy.json`, `integrations.json`) definem escopo máximo, mas nunca concedem sozinhos autoridade para mutação destrutiva/externa. A autorização humana vem de **capability grant externo** fora de `.ai` (criado via `/ade-authorize`), validado por guards determinísticos antes de qualquer efeito externo.

Fluxo exigido: `PROJECT POLICY (max) → ADE DETERMINISTIC GUARDS (validate) → OPENCODE PERMISSION LAYER (deny/ask/allow) → HUMAN GRANT (outside .ai, single-use, TTL, fingerprint) → execução`. Sem grant → `ADE_HUMAN_AUTHORIZATION_REQUIRED` e ZERO external mutations. `ask` em `--auto` é `AUTO_APPROVED` e não substitui grant.

## Two-channel Human Authorization (v5.2.6 Hardened)

Para operações `HUMAN_REQUIRED` (`tracker sync/write`, `vcs stage/commit/push/pr_create`, `project/diagnostic check` com host process), o plugin exige **grant efêmero** fora do repo:

- Criado **apenas** via comando humano `/ade-authorize <tool> [json-resource]` no TUI; agente/modelo não tem tool para criar grants.
- Armazenado em `~/.config/opencode/ade-grants/<project_hash>.jsonl` (Windows: `%LOCALAPPDATA%\opencode\ade-grants`) com `withFileLock`, `fsync`, `0o600`, **fora de `.ai`**; grants dentro de `.ai` são ignorados.
- Contém `{project_hash=sha256(realpath(root)), action, resource_hash=sha256(canonical(resource)), nonce, issued_at, expires_at (10min), max_uses=1, remaining_uses}`; `resource_hash` é fingerprint exato (ex: `updates` sorted para tracker sync, `{branch,remote,remote_url}` para push, `{paths}` sorted para stage).
- Consumo é **atômico antes do side effect** via `withFileLock`; sem grant → ZERO `fetch`/`spawn`/`git`; grant expirado, `max_uses` esgotado, `action`/`resource` mismatch, ou `project_hash` diferente (alias) → bloqueado.
- `always allow` salvo não substitui grant; `dry_run` não exige grant.
- Telemetry registra `human.grant.create`/`consume`/`missing` com `authorization=USER_GRANT` ou `NONE`/`AUTO_UNTRUSTED` sem segredo.

## Auto-approve e `ask`

`opencode --auto` aprova automaticamente `ask` não negado. `ask` sozinho **não** é considerado `USER_APPROVED`; o grant é a prova. A API V2 não distingue `AUTO_APPROVED` vs `USER_APPROVED` confiavelmente, então v5.2.6 mantém fail-closed via grant e documenta a limitação. Recomenda não usar `--auto` para sessões sensíveis sem grant, e nunca registra `AUTO_APPROVED` como humano.

## Filesystem

- Containment por `realpath` (`safeFile`, `safeExistingRealPath`, `assertProjectStateBoundary`) em todo acesso a `.ai/control.json`, policies e paths de tool.
- Rejeição de symlink/reparse (`is_reparse`, `FILE_ATTRIBUTE_REPARSE_POINT` no Windows, `lstat` no Unix) para `.ai/`, `control.json`, `*.jsonl`, policies e arquivos gerenciados.
- Proteção Windows e Unix: `inside(root, candidate)` com `toLowerCase` no Windows e `relative_to` no Python; `assert_safe_chain` verifica toda a cadeia até `/`.
- Paths sensíveis bloqueados em `permission.hook("evaluate")` para `read` com `SECRET_FILE` e `SENSITIVE_RESOURCE` usando `/` e `\` normalizados.
- Atomic writes com `fsync`: `writeTextAtomic`, `writeJsonAtomic`, `copy_file_atomic` com `tmp` + `rename` + `sync`.
- Bounded JSON/JSONL: `MAX_JSON_BYTES 2MB`, `MAX_TOOL_TEXT 200KB`, `LOG_LIMITS` (audit/evidence 8MB/3 backups, telemetry 12MB/2, handoffs 6MB/3).
- Corrupção fail-visible: `readJsonl` conta `invalid_records` e lança `LOG_CORRUPT`; `readProjectJson` valida JSON e rejeita oversized.

Protege pelo menos: `.git`, `.ssh`, `.aws`, `.config/gh`, `.docker/config.json`, `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials/secrets/tokens`, `*credential*.json`.

## Secrets

Detecção e redaction em `SENSITIVE_TEXT_PATTERNS` (private keys, `github_pat_`, `gh[pousr]_`, `sk-*`, `AKIA*`, `xox*`, `glpat-*`, `npm_*`, `AIza*`, JWT `eyJ...`, `Bearer|Basic`, assignments `token|secret|password|api_key`).

- `redactSensitiveText` e `redactForModel` aplicados em todo `stdout/stderr`, diffs, payloads e telemetria.
- `assertNoSecretOutbound` bloqueia envio se payload contém `secretLikeText`.
- `assertNoSecretStaged` escaneia `git diff --cached --name-only -z` e blobs staged até 2MB antes de `commit`.
- `cleanErrorText` redige erros antes de persistir.

Nenhum adapter de tracker/VCS/remote envia payload detectado como secret sem política explícita e segura.

## Tracker (GitHub Project V2 / Jira / Linear)

Deny-by-default para hosts, repositories, projects, Jira projects, Linear teams via `tracker-policy.json` (`allowed_https_hosts`, `allowed_github_repositories`, `allowed_github_projects`, `allowed_jira_projects`, `allowed_linear_team_ids`) e `assertTrackerRemoteScope`.

GitHub Project sync (`ade_tracker_project_sync`):

`preflight → resolve item/field/option/iteration → validate full batch → write → read-back → verify desired==actual → runtime receipt/handoff`.

- `updates ≤50`, cada `fields ≤10`, valores validados por tipo (`SINGLE_SELECT`, `ITERATION`, `NUMBER`, `DATE`, `TEXT`).
- Duplicatas/conflitos no batch falham antes da primeira mutação (`duplicate item/field update`).
- Sem mutação antes de preflight completo.
- Verification failure gera `PARTIAL`/`FAILED` com `failures` e `verification` detalhado.
- `assertNoSecretOutbound` antes de qualquer `fetch`.
- `fetch` com `redirect:"error"`, `AbortController` 30s, `response` size ≤5MB, `TRACKER_VERIFY_FAILED` se `actual != expected`.
- Remote evidence só é `REMOTE_UNTRUSTED_DATA` até read-back confirmar.

## VCS

- Hooks habilitados por padrão; sem `--no-verify` implícito; sem `commit.gpgSign=false`.
- Bypass somente via `policy.hooks.allow_bypass === true`.
- `push.remote` allowlist (`allowed_remote_urls`) verificada via `git remote get-url` antes de `push`.
- PR repository allowlist (`allowed_repositories`) verificada antes de `fetch` para `pulls`.
- `protected_branches` bloqueia `commit`/`push` em `main/master` sem `allow_protected_branches`.
- `assertNoSecretStaged` antes de `stage` e `commit`.
- `relativeLiteralPath` + `--literal-pathspecs` para `add`.
- Post-push verificação `git ls-remote --heads` compara `SHA` local vs remoto; diverge → `VCS_VERIFY_FAILED`.

## Processes

- Env mínimo (`minimalEnv`: `PATH`, `SystemRoot`, `HOME`, etc.) — não herda tokens.
- `vcsEnv` adiciona apenas `SSH_AUTH_SOCK`, `GIT_ASKPASS`, `GIT_SSH*` quando necessário.
- Host process checks exigem `allow_host_process=true` e `runner: process` explícito; caso contrário bloqueia com `prefira docker sandbox`.
- Interpreters genéricos bloqueados em `blockedExecutables`: `pwsh`, `powershell`, `cmd`, `bash`, `sh`, `zsh`, `fish`, `wsl`, `docker`, `podman`, `git` — não podem ser `executable` por caminho genérico.
- Argumentos limitados (`≤64`, cada `≤4096`, total `≤65536`, sem `\0`).
- `environment.allow` ≤32 entradas, cada `^[A-Za-z_][A-Za-z0-9_]{0,63}$`; secret env exige `allow_secret_environment=true`.

## Docker

Defaults seguros exigidos, só relaxados com opt-in:

- `network=none` (exige `allow_network=true` para outro).
- Root filesystem `read-only` (`--read-only`).
- `cap-drop=ALL`, `no-new-privileges`, `pids-limit 256`, `memory` e `cpus` limitados, `/tmp` `rw,noexec,nosuid,size=256m`, workspace `ro` a menos que `allow_workspace_writes=true`.
- Image digest pinning: exige `@sha256:[0-9a-f]{64}` a menos que `allow_mutable_image=true`.
- Timeout por `timeout_ms` (1s–300s) e cleanup por `cidfile` (`docker rm -f`).

## Installer / migrate / uninstall

- `manifest size bounds` (`MAX_JSON_BYTES`), symlink/reparse rejection (`assert_tree_no_links`, `is_reparse`), `atomic install/restore` com `fsync` e `sha256` verification (`copy_file_verified`).
- Backup containment: `_backup_base` fora do target customizado, `within(base,target)` check, `_backup_file` com `relative_to` e `secure_mkdir`.
- Rollback fail-visible: `try/except` coleta `ROLLBACK_INCOMPLETE` com até 10 erros, nunca silencia.
- Uninstall recusa `managed files` convertidos em links (`is_reparse` em `previous_manifest` e destinos).
- Nunca segue paths controlados pelo manifesto para fora das roots permitidas (`assert_safe_chain` em cada `dst.parent`).
- `migrate` só aceita `4.x`/`5.0.x`/`5.1.x`/`5.2.0`–`5.2.5` → `5.2.6`; `uninstall` valida `schema_version 7`.

## Control Plane

`LLM decide conteúdo; ADE decide mecânica.` Routing determinístico via `ade_route_snapshot` + `routingHint` (produto → entrega → engenharia). Operações CRUD determinísticas não passam por chains LLM.

Orchestrator → Project Manager → `ade_tracker_project_snapshot` → `ade_tracker_project_sync` → GitHub → read-back → verified → runtime handoff. Evita `Orchestrator → PM LLM → Tracker LLM → shell/gh → retries`.

## Retries / Circuit Breaker

- Mesma `failure signature` não gera retries infinitos.
- `tool_choice only auto` → `retry:false` determinístico, zero retry.
- `reasoning item expired` → no máximo uma recuperação (`retry:true,delay:400` primeira vez, segunda `retry:false`).
- Repetição da mesma assinatura abre circuito (`seen>0` → deny).
- Failure domain explícito (`PROVIDER_OR_OPENCODE_RUNTIME`, `AUTH`, `PERMISSION`, `UNKNOWN`) em `telemetry`.

## Handoff / Post State

Runtime-generated handoffs (`origin=runtime`) quando a operação determinística conhece o resultado. `transition` e `executeProjectSync` retornam `{canonical_handoff, post_state}`. `post_state` é `compactControl` após mutação, com `global_status` recomputado. Orchestrator constrói resposta após `ade_route_snapshot` pós-operação; `canonical post_state` vence prose de subagent.

## Performance / Instalação

Instalação é FAST PATH: `validate package/static → backup → install/migrate → manifest → rollback capability → finish`. Não roda behavioral matrix durante `install/migrate`. `validate` = Core+Contract; `assure` e `live-test` são explícitos após restart.

## Limitações conhecidas (v5.2.6)

- Distinguir `USER_APPROVED` vs `AUTO_APPROVED` depende de expor `permission.replied` com `reply: once|always` e detectar `auto` flag — atualmente não confiável, então documentado como `AUTO_APPROVED` não humano.
- Windows `fs.realpath` para junctions requer `FILE_ATTRIBUTE_REPARSE_POINT`; alguns reparse points podem exigir privilégio para `lstat`.
- `log rotation` é cooperativa (verifica `size + incomingBytes` sob lock), não atômica com `appendFile` concorrente externo.
