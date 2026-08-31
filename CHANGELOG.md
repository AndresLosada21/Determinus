# Changelog

## 6.0.10 - Autonomous Project Self-Healing

- Add bounded SAFE_AUTO_REPAIR for historical/existing project execution policy before engineering DAG creation.
- Secure-bootstrap missing policy as `authorized:false`; preserve custom fields and fail closed on malformed/unknown schema.
- Resolve the official process-check mismatch: `runner=process` is the check-level opt-in, legacy missing `allow_host_process` is normalized, and explicit false remains a hard veto.
- Preserve policy authorization plus exact-effect single-use grant as the human execution boundary.
- Add restrictive Docker-only normalization and no inferred network/write/mutable-image permissions.
- Add existing-project, legacy-process, explicit-deny, Docker-default and malformed-policy functional regressions.
- Fix the plugin runtime version constant divergence discovered during release review.

## 6.0.9 - Beta-18721 Worker Contract & Release Integrity

- Require settled canonical V2 assistant evidence (`time.completed`) while preserving explicit legacy parser compatibility.
- Centralize canonical worker `SystemPart` construction and add permanent INC-BETA18721-WORKER-ZERO-TOKEN coverage for every worker role.
- Complete the Promise `session.prompt` type shim with `id?: string`.
- Add deterministic `WORKER_EXECUTION_FAILED`, `WORKER_INTERRUPTED`, `WORKER_TIMEOUT`, and `WORKER_INVALID_OUTPUT` domains; terminal failures no longer enter the generic blind retry path.
- Convert current lifecycle mocks to canonical V2 prompt-admission / wait / assistant-context shapes.
- Add current-release metadata/docs/test-count consistency gates.
- Explicitly reject speculative same-ID wake recovery for this release; beta-18721 already serializes/coalesces session execution and no observed failure requires an extra wake.
- Preserve 6.0.8 fail-fast engineering execution-policy preflight.

## 6.0.8 - Engineering Policy Preflight

- Fail fast at `ade_workflow_start` when an engineering workflow cannot resolve its project execution policy.
- Require `.ai/execution-policy.json`, explicit policy authorization, registered `check_names`, `owner=verifier`, and `non_destructive=true` before creating the durable DAG.
- Prevent ANALYZE/BUILD/VERIFY token spend when deterministic verification is impossible by configuration.
- Preserve the 6.0.7 beta-18721 worker fix and all fail-closed human authorization boundaries; no policy is auto-authorized or invented.

## 6.0.7 - OpenCode V2 Worker SystemPart Contract Fix

- Fix worker-only `session:context` injection to emit canonical beta-18721 `SystemPart` values: `{ type: "text", text: ... }`.
- Distinguish `Session.Info.outcome=failed` from a genuine empty assistant response after `session.wait()`.
- Add regressions for the exact worker SystemPart schema and zero-token failed session outcome.

## 6.0.6 - OpenCode V2 Worker Message Contract Fix

- Fix durable worker result parsing for OpenCode `0.0.0-beta-18721`: canonical assistant messages are discriminated by `type: "assistant"`, not only legacy `role`/`info.role`.
- Treat `session.prompt` as the V2 admission operation it is on beta-18721; wait for idle and read worker evidence from `session.context`.
- Keep `delivery: "steer"` because the exact beta-18721 schema explicitly supports `steer | queue` and defaults prompts to steer.
- Replace the worker-session mock with the beta-18721 contract so this regression can no longer pass against a V1-shaped fake response.
- Add exact V2 session typings for create/wait/interrupt/switchModel and delivery modes.

## 6.0.5 - Synchronous Worker Result Capture (superseded)

- Historical attempted fix: treated `session.prompt` as returning assistant output. This diagnosis is superseded by 6.0.6 for beta-18721, where prompt returns an admission receipt and assistant output is read from `session.context`.

## 6.0.4 - OpenCode Directory Entrypoint

- Add the required root `plugin/index.ts` entrypoint for configured OpenCode V2 plugin directories.

## 6.0.3 - Explicit Plugin Registration

- Register the managed native plugin explicitly in the OpenCode V2 `plugins` configuration array.
- Preserve existing plugin entries and reject an invalid non-array `plugins` setting.

## 6.0.2 - Durable Worker Dispatch Fix

- Dispatch newly-created durable workers with `steer`, not queued delivery.
- Reject non-assistant session input as worker output; user capsules cannot cause false `DONE`.

## 6.0.1 — Durable Engineering Runtime

- Replaced agent-to-agent orchestration with a durable kernel and 5 active gateway/worker agents.
- Added external hash-chained event journal, derived snapshots, leases, reconciliation and safe read-only corruption mode.
- Added workflow DAGs for analysis, engineering, implementation proposals and deterministic tracker sync.
- Made engineering verification deterministic and approval-resumable without rerunning completed checks/workers.
- Preserved exact-effect authorization, VCS/tracker/process/Docker/secret hardening and scoped Zen provider compatibility.
- Added transactional major migration from managed v5 releases, with v5.2.8 as the tested direct baseline.
- Physically removed the v5 Managed Delegation implementation/tool surface; only the durable kernel may create worker sessions.

## 5.2.8 — Managed Delegation Runtime

- Added `ade_delegate` as the 29th typed ADE tool and moved child-session mechanics into the plugin runtime.
- Raw native `subagent` is hidden and denied for all ADE agents; coordinators use the runtime DAG.
- `ADE_DELEGATION_CONTEXT: COMPLETE` is enforced as session metadata: Skill/canonical rehydration are blocked and `DISCOVERY_ALLOWED=false` removes discovery tools.
- `required_child` is exact, one-shot and enforced before child creation; coordinator pre-delegation discovery is capped at two actions; fan-out <=3 and depth <=2.
- Managed delegation is synchronous (`session.create → switchAgent → prompt → wait → context`), preventing the parent from completing while the child is still delegating.
- Missing final structured handoff produces a runtime `PARTIAL` fallback, never synthetic `DONE`; managed failures return BLOCKED and interrupt the child.
- Behavioral smokes now validate `ade_delegate` and persisted canonical handoffs instead of the prohibited raw `subagent`.
- Retains v5.2.7 Windows grant parity and scoped Zen auto-only `tool_choice` compatibility plus all v5.2.6 exact-effect security hardening.
- Direct managed migration `5.2.7 → 5.2.8`; install/migrate remain FAST PATH.

## 5.2.7 — Windows + Zen Compatibility Hardening

- Fixed Windows grant-test identity parity: test project hashes now normalize `realpath` exactly like production; positive C/G/L grant flows issue via real `/ade-authorize`.
- Added scoped OpenCode Zen auto-only `tool_choice` wire compatibility using `session.hook("http.request")`: `required`/named → `auto`, `none` → tools omitted, unknown providers untouched.
- Added `provider-tool-choice-compat` and `windows-grant-test-parity` Python gates plus six Node provider compatibility tests.
- Preserved v5.2.6 exact-effect grants, grant-store isolation, TOCTOU revalidation, deterministic tracker adapter, VCS/Docker/filesystem/secrets hardening and retry circuit breaker.
- Added direct managed migration `5.2.6 → 5.2.7`; install/migrate remain FAST PATH without behavioral matrix.

## 5.2.6 Hardened — Human Authorization Boundary

- **Authorization boundary**: `repo policy != human authority`. `.ai/*-policy.json` define limites máximos; mutações de alto impacto exigem `ask` via permissão nativa OpenCode **e** `EXPLICIT_EXTERNAL_GRANT` single-use fora do projeto (`ade_tracker_project_sync`, `ade_tracker_write`, `ade_vcs_stage/commit/push`, `ade_pr_create`, `ade_project_check`/`ade_diagnostic_check` com host process). `project-manager`, `tracker-operator`, `verifier`, `debugger`, `vcs-operator` agora têm `ask` para essas tools; leituras permanecem `allow`.
- **Fail-closed em auto-approve/always**: `ask` pode ser auto-aprovado, mas a execução continua bloqueada sem grant externo correspondente; nenhuma telemetria chama auto-approve de autorização humana.
- **Exact-effect grant binding**: fingerprints agora cobrem payload integral por hash, target remoto/config, worktree/staged state, HEAD SHA, PR repo/base/head e definição completa de project-check; grant store é inacessível aos agents e corrupção falha fechado.
- **Plugin runtime**: `ctx.permission.hook("evaluate")` força `ask` para tools de alto impacto mesmo se frontmatter divergir; mensagem `ADE_HUMAN_AUTHORIZATION_REQUIRED` explícita.
- **Hardening preservado**: containment realpath, symlink/reparse rejection, atomic writes com fsync, bounded JSON/JSONL com `LOG_CORRUPT` fail-visible, rotação, secrets detection/redaction/outbound blocking, GitHub Project sync preflight→resolve→validate→write→read-back→verify→receipt, VCS hooks sem `--no-verify` implícito, env mínimo, Docker `network=none`/`read-only`/`cap-drop=ALL`/`no-new-privileges`/digest pinning, installer atomic rollback.
- **Testes negativos reais (79 Node + 41 Python)**: cobrem repo self-authorization, ausência de human approval, policy fora do root, symlink, `.git/config` Windows/Unix, secret outbound, staged secret, allowlist VCS/Tracker/Jira, batch duplicado/conflitante, verificação read-back, JSONL corrompido, oversized manifest, path traversal, junction, env mínimo, Docker defaults, circuit breaker, runtime handoff revision, post_state, auto-approve distinction, e 28 testes funcionais de autorização/grants (A-AB, com letras relevantes M-AB adicionadas para exact-effect/TOCTOU) com ZERO mutation sem grant, single-use, expiração, resource mismatch, alias, always-bypass, telemetry sem segredo.
- **Migração**: `v5.2.5 → v5.2.6` direta e `v5.2.6 → v5.2.5` rollback byte-a-byte validados.
- **Infra**: `plugin/types/node-shim.d.ts` corrigido para Windows (`fileURLToPath`, `Buffer`, `node:os`), `lifecycle.test.mjs` fix `path.resolve(fileURLToPath(...))`, `TypeScript` PASS, `ZIP` integrity PASS.

## 5.2.5 — Deterministic Control Plane

- Added direct GitHub Project V2 snapshot/sync tools owned by Project Manager; Tracker Operator is fallback-only for normal Project V2 sync.
- Added field/option/iteration mapping, post-write read-back verification and runtime operation receipts.
- State transitions and deterministic tracker syncs now emit runtime canonical handoffs and `post_state`.
- Added normalized provider failure signatures, zero retry for deterministic auto-only `tool_choice`, and one-retry circuit breaker for repeated `reasoning item expired`.
- Added `/ade-failures`.
- Explicitly separated migration/install from behavioral/live testing.

## 5.2.5
- Child execution `DELEGATION_DRIVEN` com envelope compacto.
- Hard reduction de state/evidence tools em owners delegados.
- Tracker Operator leaf estrita.
- Behavioral reliability multi-trial sem leniência semântica.

## 5.2.5 — Unified structured communication + cost intelligence
- canonical `ade_handoff_submit` with bounded schema and authority validation;
- durable `.ai/handoffs.jsonl` + compact recent handoffs;
- handoff communication does not mutate canonical state revision;
- state-vs-handoff routing advisory with state precedence;
- deterministic Contract Assurance on every validate;
- behavioral canaries validate structured tool behavior instead of magic output markers;
- release assurance runs behavioral canary by default with a model;
- model dispatch / provider retry telemetry;
- `/ade-cost` and `/ade-handoffs`;
- v5.2.0 → v5.2.5 managed migration.

## 5.2.0 — State-driven stabilization & efficiency
- state-driven routing;
- lazy Skill loading;
- compact user UX;
- evidence hardening;
- bounded provider retry;
- initial ADE telemetry.

## 5.2.5

- Added isolated OpenCode live integration matrix for multiple real models.
- Added current OpenCode Zen free-model defaults with local availability/runtime probing.
- Added strict multi-trial behavioral reporting, JSON/Markdown reports and redacted evidence bundles.
- Added normalized failure-domain diagnostics without relaxing behavioral assertions.
- Added managed v5.2.3 → v5.2.5 migration support.
