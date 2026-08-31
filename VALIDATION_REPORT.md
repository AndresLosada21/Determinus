# Validation report — ADE 6.0.11

Release classification: **SOURCE_VALIDATED / HOST_VALIDATION_PENDING**.

## Deterministic source gates

- Python regression: **36/36 PASS**.
- Node plugin tests: **104/104 PASS**.
- TypeScript: **PASS**.
- Static Policy: **PASS**.
- Historical-project self-heal regressions: **PASS**.
- Explicit `allow_host_process=false` veto preservation: **PASS**.
- Legacy process-check normalization: **PASS**.
- Restrictive Docker normalization: **PASS**.
- Malformed historical policy fail-closed: **PASS**.
- Plugin runtime/package version consistency gate: **PASS**.

## Artifact and lifecycle gates

A clean extraction of the release candidate source ZIP reran successfully: **36/36 Python, 104/104 Node, TypeScript PASS, Static Policy PASS**.

Fresh managed installation to an isolated OpenCode config target passed and reported package `6.0.11`, manifest schema 7, 18 managed agent files, 5 active agents and 34 tools.

Managed migration **6.0.10 → 6.0.11** passed **without `--force`**. The installer now verifies the canonical active-agent catalog rather than treating managed Markdown files as readiness evidence.

## Host boundary

This build environment does not contain the user's Windows `opencode2 0.0.0-beta-18721` host. Therefore this release is not labeled `HOST_VALIDATED` here. A real host canary must validate project self-heal, exact-effect check execution, and the complete engineering chain.
