# ADE 6.0.1 — Codex Compatibility & Workflow UX

Patch release for the ADE 6 Durable Engineering Runtime.

## Fixed: OpenAI ChatGPT/Codex HTTP 400

When OpenCode authenticates the `openai` provider through the ChatGPT/Codex backend, ADE generation budgets are lowered by the host into a wire-level `max_output_tokens` property. The observed Codex route rejects that field with HTTP 400.

ADE 6.0.1 keeps semantic generation budgets, but the native `http.request` compatibility hook removes `max_output_tokens` only for `chatgpt.com/backend-api/codex/responses`. Public `api.openai.com/v1/responses` requests are left unchanged, preserving normal OpenAI API budgets.

## Fixed: opaque workflow-start UX

`ade_workflow_start` creates and persists a workflow DAG; it does not run workers. It now returns:

- `event: WORKFLOW_STARTED`;
- `workflow_id`;
- the public workflow snapshot;
- `next_action` pointing to `ade_workflow_run`;
- an explicit note that no worker session has started yet.

The Orchestrator is instructed to call `ade_workflow_run` in the same turn unless the user explicitly asked to only create/plan the workflow. A new `/ade-workflow` command shows the active workflow, next job, pending authorization and continuation command.

## Preserved

The v6 Durable Kernel architecture, event journal, leases/reconciliation, worker non-delegation, exact-effect authorization, VCS/tracker/process/Docker hardening, and scoped Zen auto-only `tool_choice` compatibility remain unchanged.

Release state remains `SOURCE_HARDENED_VALIDATED_RUNTIME_PENDING` until the patch is revalidated on the real Windows/OpenCode host.
