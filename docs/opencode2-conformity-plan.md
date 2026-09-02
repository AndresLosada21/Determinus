# Determinus for OpenCode 2 — correction and conformity plan

## Target state

Deterministic, auditable seven-gate workflow control on OpenCode 2, without
replaying unbounded tool output or relying on OpenCode 1 hook shapes. The
deployment must be repeatable, its bundle manifest authoritative, and archive
operations must work on Windows path spellings.

## Findings and risk classification

| Finding | Effect | Severity | Disposition |
| --- | --- | --- | --- |
| OpenCode replays prior tool output into successive requests | A long workflow can grow each request by tens or hundreds of thousands of tokens | Critical | Compact native v2 tool results in the plugin; use a fresh session at a gate boundary |
| Determinus v2 wrapper called a legacy compaction hook on every context request | Mutable, legacy-shaped context was injected repeatedly into prompts | Critical | Removed; OpenCode 2 owns its own compactor |
| The old compacting code expected `{ info, parts }`, while OpenCode 2 emits `{ role, content }` and `tool-result` | The intended compaction was a no-op for the real v2 transcript | Critical | Added and tested v2 message/part handling |
| Cache policy recognized only agent id `adv` | Renamed `determinus` traffic had no explicit one-hour cache policy | High | Optional, checked OpenCode-core patch |
| Installer copied only `adv-*.md` | A clean install missed the current `/determinus-*` slash commands | High | Installer deploys both command families |
| Windows root comparison used raw strings | `C:/` and `C:\\` could fail archive finalization for the same repo | High | Canonical real-path, slash, and case comparison |
| `run_test` was used for writes/echoes | Evidence can look green without proving the implementation | High | Operational rule and explicit remaining hardening item |

## What is changed in this release

1. **Native v2 prompt reduction.** Old native `tool-result` text above 8 KB
   is replaced by a bounded, traceable summary marker. The two newest messages
   stay untouched so the active operation still has its immediate evidence.
2. **Correct lifecycle ownership.** The v1 `experimental.session.compacting`
   emulation has been removed from the v2 context event. Determinus retains
   its prompt transformations but no longer manufactures compaction context on
   every request.
3. **Archive portability.** Both archive repair validation and finalization
   now compare canonical repository identities rather than Windows path
   spelling.
4. **Install correctness.** Deployment installs runtime dependencies in the
   staged plugin directory, verifies `@opencode-ai/plugin`, and publishes only
   the canonical `determinus-*` commands and `determinus.md` agent.
5. **Official host boundary.** Determinus does not patch or compile the
   official OpenCode Beta. It uses only the public plugin surface.

## Controlled installation and rollback

1. Extract the release and run `install-opencode2.ps1` in PowerShell. It
   installs dependencies, checks source integrity, runs the focused OpenCode2
   regression suite, builds the bundle, and uses the project's safe deploy
   script.
2. Fully restart the OpenCode plugin host. A restart is mandatory because a
   loaded Node module remains in memory.
3. Start a new session for verification. Existing 200k+ transcripts cannot be
   made cheap retroactively; their historical content already exists.
4. Run `scripts/validate-opencode2-runtime.ps1`.

Rollback is deliberately simple: run the existing deployment script with the
previous known-good release, restore the pre-patch OpenCode commit if the
optional core patch was applied, and restart the host. Do not hot-edit the
active installed `dist` bundle.

## Acceptance matrix

| Area | Check | Pass condition |
| --- | --- | --- |
| Source | `pnpm run check` | Type/schema/lint/format checks pass |
| Regression | `pnpm run test:opencode2` | v2 compaction and worktree-focused tests pass |
| Bundle | `plugin/dist/plugin-bundle-manifest.json` | Generated after build and accepted by deploy script |
| Commands | `validate-opencode2-runtime.ps1` | `determinus-apply.md` and `determinus-archive.md` installed |
| Runtime | Fresh 3-message large-result scenario | First old result is bounded; last two are retained |
| Archive | Same repo with `C:/` and `C:\\` spellings | No `WORKTREE_PROJECT_MISMATCH` |
| Billing | Fresh simple Plan request | No inherited 200k+ transcript; cache shows expected behavior when patch is used |

## Operational guardrails

- Use one agent identity, model, and mode for the lifetime of a change. Do not
  switch from Determinus to Plan inside a large change transcript; explain or
  review it in a fresh session.
- Compact or begin a new session at every gate boundary, and before roughly
  120k accumulated tokens. This is an operational ceiling, not a claim that
  the provider will erase old history automatically.
- Stop after two identical tool failures. A retry must change its precondition
  (path, branch, permission, or host restart) and record the change.
- `determinus_run_test` is test evidence only: no writes, placeholder `echo`
  checks, or shell workflow control. Use native OpenCode write/shell facilities
  in Default mode; require named tests for an execution checkpoint.
- Treat a reported token line as **one request context**, not just response
  text. `235,788 new / 0 cached` is consistent with history replay after the
  agent switch, not with the short Portuguese question alone.

## Conformity roadmap after this release

| Phase | Owner | Deliverable | Exit criterion |
| --- | --- | --- | --- |
| 1 — deploy | Operator | This release and host restart | Runtime validation passes |
| 2 — measure | Operator | Fresh-session trace with request token totals | Simple Plan explanation remains within budget |
| 3 — enforce evidence | Determinus maintainers | Mutating-command rejection in `run_test` plus tests | No checkpoint can use synthetic shell evidence |
| 4 — upstream OpenCode | OpenCode maintainers | Configurable per-agent early compaction and request-level token attribution | Long-run policy is enforceable in the scheduler |
| 5 — release gate | Operator | Canary change with archive | Apply, archive, and restart recovery complete without manual hotpatch |

The plugin cannot change OpenCode's request scheduler or recover tokens spent
before installation. The supplied core patch addresses cache identity; early
compaction and per-request billing attribution remain upstream requirements.
