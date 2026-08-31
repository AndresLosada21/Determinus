# ADE 6.1.2 - Native Worker Projection Fix

ADE 6.1.2 is a real-host canary correction for the 6.1.1 Durable Observable Runtime.

The 6.1.1 package loaded correctly on OpenCode2 `0.0.0-beta-18743`, captured worker events and completed durable jobs, but the parent TUI still behaved like a black box during a real 3m41s ANALYZE run. The defect was architectural: ADE treated `ToolContext.progress()` as a visible output stream, while OpenCode's native subagent UI is driven by parent-linked child sessions and Task-shaped tool metadata.

## Changes

- Worker sessions are created with `parentID` set to the orchestrator session.
- Running `ade_workflow_run` now publishes OpenCode Task-compatible metadata:
  - `title`
  - `metadata.sessionId`
  - `metadata.summary` with child tool states
- The Observation Plane journal remains noncanonical and still provides event/polling recovery.
- `/ade-doctor` now separates:
  - `capture_mode` - whether ADE receives worker events;
  - `delivery_mode` - how progress is projected to the host;
  - `visibility` - never claimed without a target-host canary.
- `EVENT_NATIVE` no longer means or implies "visible in the TUI".
- Existing 6.1.1 durable state remains readable; no canonical journal rewrite is required.

## Security

The native child session ID is used only in host tool metadata because OpenCode uses it to hydrate/navigate child sessions. Model-facing ADE status/events continue to use hashed `worker_session_ref` values. Reasoning text remains excluded from observation output.

## Required host canary

After upgrade/restart, run a nontrivial analysis workflow. During `ade_workflow_run`, verify that the running ADE worker is represented as a child/progress entry rather than only appearing after completion. If the host still suppresses custom-tool Task-compatible metadata, retain `ade_worker_events` as ground truth and report the transcript/UI behavior; that would establish a host UI limitation rather than an event-capture failure.
