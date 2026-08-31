# Validation report — ADE 6.0.1

This report is sealed with the final source package. Deterministic source gates: **35/35 Python regression groups, 88/88 Node plugin tests, Static Policy PASS and TypeScript PASS**. Exact hashes are recorded in `RELEASE.json` and the release-bundle validation summary.

The v6 validation target is the Durable Engineering Runtime: 5 active workers/gateway agents, 18 managed agent files for rollback compatibility, 34 typed tools, hash-chained external journal, kernel-owned scheduler, leases/reconciliation, deterministic engineering checks and exact-effect external authorization.

Real Windows/OpenCode/provider validation remains `RUNTIME_PENDING` until the released artifact is installed on the user's host. Deterministic release gates do not claim live provider compatibility beyond the tested mocks/contracts. The build container has no `opencode2` binary, so host Contract Assurance is intentionally not claimed here.

## Deterministic lifecycle

- Fresh install 6.0.1: PASS (`INSTALL_V6_0_1_OK`, manifest schema 7, 18 managed agent files, 5 active agents, 34 tools).
- Managed patch migration 6.0.0 → 6.0.1: PASS (`MIGRATION_TO_V6_0_1_OK`).
- Patch rollback 6.0.1 → restore 6.0.0: PASS (`preserved_modified=0`); `agents/orchestrator.md`, plugin `src/index.ts`, and `capabilities.json` restored byte-for-byte; prior manifest restored as package 6.0.0.
- Managed direct migration 5.2.8 → 6.0.1: PASS (`MIGRATION_TO_V6_0_1_OK`).
- Rollback 6.0.1 → restore 5.2.8: PASS (`preserved_modified=0`); representative `agents/orchestrator.md` and plugin `src/index.ts` restored byte-for-byte, and prior manifest restored as package 5.2.8.
- Source-level provider compatibility: PASS — ChatGPT/Codex Responses strips only wire-level `max_output_tokens`; public `api.openai.com/v1/responses` preserves it.
- Workflow-start UX contract: PASS — `ade_workflow_start` returns `WORKFLOW_STARTED`, `workflow_id`, and `next_action`; `/ade-workflow` exposes active durable state; Orchestrator is instructed to run the workflow in the same turn unless the user explicitly requested plan-only.
- No active-install hotpatching or behavioral-provider matrix is part of install/migrate.
