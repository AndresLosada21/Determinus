<!-- AI-DRIVEN-ENGINEERING:BEGIN v6 -->
## ADE 6.1.0 Durable Engineering Runtime

The ADE kernel is the control plane. LLM agents are disposable workers.

- Use `ade_status` / `ade_workflow_snapshot` to observe canonical durable state.
- Use `ade_workflow_start` to submit intent and `ade_workflow_run` to advance jobs.
- Never use raw `subagent`, shell, legacy `ade_delegate`, legacy plane state transitions or manual `gh` as a workflow fallback.
- Workers never create workers. Only the kernel scheduler creates OpenCode worker sessions.
- Engineering `DONE` requires configured deterministic project checks.
- High-impact deterministic activities require an exact-effect `/ade-authorize` grant; OpenCode `--auto` is not a substitute.
- `WAITING_APPROVAL` is a durable state, not a failure. Authorize the exact pending effect, then resume the same workflow.
- If the journal is corrupt or the external kernel store is unsafe, remain `SAFE_READ_ONLY`; do not reconstruct state from prose.
- Legacy `.ai/control.json` may be retained for history/config compatibility but is not canonical v6 workflow state.
<!-- AI-DRIVEN-ENGINEERING:END v6 -->
