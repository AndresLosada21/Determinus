<!-- AI-DRIVEN-ENGINEERING:BEGIN v6 -->
## ADE 6.1.3 Durable Engineering Runtime

The ADE kernel is the control plane. LLM agents are disposable workers.

- Use `ade_status` / `ade_workflow_snapshot` to observe canonical durable state.
- Use `ade_workflow_start` to submit intent and `ade_workflow_run` to advance jobs.
- Never use raw `subagent`, shell, legacy `ade_delegate`, legacy plane state transitions or manual `gh` as a workflow fallback.
- Workers never create workers. Only the kernel scheduler creates OpenCode worker sessions.
- Engineering `DONE` requires deterministic project checks. For an already authorized human policy, the kernel may auto-provision only its bounded standard safe presets (`tsc-noEmit`, `dist-build`, `premium-grep-zero`).
- Routine verifier checks registered in an authorized human project policy run inside the workflow without repetitive per-check chat grants. Standalone/external high-impact mutations still require exact-effect `/ade-authorize`; OpenCode `--auto` is not a substitute.
- `WAITING_APPROVAL` is reserved for effects that actually require a human grant; do not manufacture approval stops for standard verifier presets already covered by an authorized project policy.
- If the journal is corrupt or the external kernel store is unsafe, remain `SAFE_READ_ONLY`; do not reconstruct state from prose.
- Legacy `.ai/control.json` may be retained for history/config compatibility but is not canonical v6 workflow state.
- Historical kernel events are audit history, not current blockers; current truth is `ade_status` + active `ade_workflow_snapshot`.
- Git is optional for `NO_REPOSITORY` / `VCS_UNAVAILABLE` (filesystem evidence); only inconsistent VCS fails admission.
- `EVENT_NATIVE` certifies capture only, not TUI visibility; consult the separate delivery/visibility fields.
<!-- AI-DRIVEN-ENGINEERING:END v6 -->
