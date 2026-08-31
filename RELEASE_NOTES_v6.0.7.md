# ADE 6.0.7 - OpenCode V2 Worker SystemPart Contract Fix

ADE v6 patch release for the durable worker runtime.

Target: OpenCode V2 `0.0.0-beta-18721` (source commit `90fb6562ce09782c311040ba39a9d50edec6ad0e`).

## Root cause fixed

The beta-18721 Promise plugin contract defines `SessionContext.system` as `SystemPart[]`. The exact `SystemPart` schema requires `{ type: "text", text: string }`. ADE 6.0.6 injected the worker-only runtime instruction as `{ text: string }`, omitting the mandatory `type`. That hook runs for `explorer`, `implementer`, `verifier`, and `reviewer`, but not the Orchestrator, matching the host symptom: Orchestrator works while durable workers terminate before provider usage with zero tokens and no assistant message.

ADE 6.0.7 emits the canonical `{ type: "text", text: ... }` shape.

## Failure observability

OpenCode `session.wait()` waits for idle and does not expose the execution failure cause. ADE now inspects canonical `Session.Info.outcome` after wait when no assistant output exists. A host-side failed execution is reported as `ADE_KERNEL_WORKER_EXECUTION_FAILED` with sanitized context kinds and token counts; genuine empty output remains `ADE_KERNEL_WORKER_INVALID_OUTPUT`.

## Regression hardening

- Added a strict regression asserting every ADE-injected worker `SystemPart` carries `type: "text"`.
- Added a regression that distinguishes host execution failure (`outcome=failed`, zero tokens) from merely missing assistant output.
- Expanded the local beta-18721 session type shim with canonical `outcome` and token fields.

## Validation boundary

Source, unit, TypeScript and static-policy gates can be completed locally. Real Windows/OpenCode/provider execution remains runtime validation pending until the user's agent migrates and reruns the host workflow.
