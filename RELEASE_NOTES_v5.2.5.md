# ADE v5.2.5 — Deterministic Control Plane

This release responds to real-project evidence from v5.2.3: Core/Contract passed while free models repeatedly produced extra state reads, failed subagents and tracker synchronization failures. v5.2.5 does not relax those behavioral tests. It removes mechanical operations from the LLM path where possible.

## Major changes

- GitHub Project V2 synchronization is now a direct Project Manager capability (`ade_tracker_project_snapshot`, `ade_tracker_project_sync`).
- Sync resolves field IDs, single-select option IDs and iteration IDs, performs writes, reads back the project and verifies desired vs actual values.
- Tracker Operator remains only as fallback for unsupported/ambiguous operations.
- Product/Delivery/Engineering transition tools return `post_state` and emit a runtime-generated canonical handoff.
- Deterministic tracker sync emits a runtime-generated canonical handoff and an audit receipt.
- Provider retry policy now uses normalized failure signatures and an in-memory circuit breaker: zero retry for deterministic auto-only `tool_choice`; one retry max for identical `reasoning item expired`.
- `/ade-failures` exposes recent failure signature/domain/retry decisions.
- Orchestrator contract now requires a post-operation `ade_route_snapshot` before the final user brief.
- Tool registry: 28 typed ADE tools, 18 agents.

## What did not change

- No relaxation of behavioral assertions.
- Product/Delivery/Engineering acceptance authority remains separated.
- `experimental.subagent_depth=2` remains canonical for current OpenCode V2.
- Tracker writes still require `.ai/tracker-policy.json` write authorization.
- Tokens/credentials are resolved through authorized OpenCode integrations and are not persisted by ADE.

## Recommended upgrade

Users on v5.2.3 can skip v5.2.4 and migrate directly to v5.2.5 using the release-bundle wrapper.
