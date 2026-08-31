# Validation report — ADE v5.2.7

## Why this release exists

Real Windows validation of v5.2.6 on OpenCode beta-18707 found two issues after Core+Contract passed: the Node grant success fixtures diverged from production Windows path normalization (73/79), and Muse/Zen subagents were rejected upstream because only `tool_choice=auto` was supported. v5.2.7 fixes both without relaxing ADE semantic assertions.

## Source gates

- Python regression: **43 groups** after release sealing.
- Static Policy: **PASS**.
- Plugin Node tests: **85 tests** expected after provider compatibility coverage.
- TypeScript `tsc --noEmit`: **PASS required**.
- 18 agents / 28 typed tools unchanged.
- Human grant exact-effect/TOCTOU A-AB retained.

## v5.2.7 additions

- Windows project-hash test parity matches production lowercase-realpath behavior.
- Successful grant scenarios issue grants via the production `/ade-authorize` command.
- `session.hook("http.request")` compatibility shim is scoped to known OpenCode Zen free auto-only models.
- `required`/named `tool_choice` becomes `auto`; `none` removes tools; unknown providers/models are untouched.
- Existing retry circuit breaker remains a fallback diagnostic, not the primary compatibility path.

## Managed lifecycle

Validated in an isolated managed target:

- fresh v5.2.7 install: **PASS** (`INSTALL_V5_2_7_OK`);
- manifest schema 7 / package 5.2.7 / 18 agents / 28 tools: **PASS**;
- managed v5.2.6 → v5.2.7 migration: **PASS** (`MIGRATION_TO_V5_2_7_OK`);
- Contract Assurance after migration: **PASS**;
- v5.2.7 uninstall → v5.2.6 restore: **PASS** (`preserved_modified=0`);
- restored `orchestrator.md`: **byte-identical PASS**.

Extracted-ZIP rerun is the final packaging gate and is performed after source freeze.

## Deliberately pending after source release

- OpenCode beta-18707 Windows runtime revalidation of v5.2.7.
- Real Muse/MiMo subagent flow through the provider shim.
- Real GitHub Project 4 snapshot/write/read-back.

Release state remains `SOURCE_HARDENED_VALIDATED_RUNTIME_PENDING` until those host/provider checks pass.
