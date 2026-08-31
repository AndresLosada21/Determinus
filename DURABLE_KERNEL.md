# Durable Kernel — ADE 6.1.3

Canonical workflow state lives outside the repository in a hash-chained journal. LLM sessions remain disposable workers. The kernel alone schedules jobs, owns leases, consumes exact-effect grants, runs deterministic verification, and decides terminal workflow state.

## Project admission reconciler

Engineering admission performs one deterministic ADE-owned self-heal pass before DAG creation. It may normalize known safe policy omissions, but it cannot self-authorize. Missing authorization, malformed/unsupported policy, ambiguous check definitions, or inconsistent VCS fail closed before any worker session is created.

## Observation Plane

`events.jsonl` is the canonical Control Plane. `observations.jsonl` is a separate noncanonical timeline used only to explain worker activity.

The plugin subscribes to `ctx.event.subscribe`, maps host events into ADE-owned worker events, and redacts secrets. Worker sessions are created with the active orchestrator session as `parentID`. The active `ade_workflow_run` projects OpenCode Task-compatible running metadata (`title`, `metadata.sessionId`, `metadata.summary`) so the host has the same child linkage/tool-summary inputs used by native subagents. Beta-18743 high-level and low-level event families are accepted. `session.reasoning.delta` is recorded only as activity presence; its text payload is never exposed.

Capture and presentation are intentionally separate contracts. `EVENT_NATIVE` means event ingestion is live; it does **not** certify that a particular TUI/client renders the metadata. `ade_doctor` reports `capture_mode`, `delivery_mode`, and a separate `visibility` canary state.

Observation modes are `EVENT_NATIVE`, `EVENT_DEGRADED`, and `POLLING_FALLBACK`. Event loss never becomes a worker failure. Fallback samples `session.get` and metadata-only `session.context` plus heartbeat.

`ade_kernel_reconcile` can reattach observation to a persisted RUNNING session. A following `ade_workflow_run` adopts that exact worker and collects its result instead of creating a replacement.

## Workspace evidence: Git when valid, filesystem when absent

Engineering does not require Git unconditionally. Admission classifies the workspace:

- `REPOSITORY`: use Git HEAD/status evidence. Dirty non-`.ai` worktree state blocks BUILD.
- `NO_REPOSITORY` / `VCS_UNAVAILABLE`: use bounded filesystem evidence.
- `VCS_INCONSISTENT`: fail closed before workers start; examples include project root nested under a different Git toplevel or a repository with unusable HEAD.

Filesystem mode writes a bounded file-fingerprint baseline into the external kernel store before the BUILDER starts. It excludes kernel/project-control directories and common dependency/cache directories, never follows symlinks, caps file count/hash work, and stores hashes/metadata rather than source contents. After BUILD, a second snapshot computes deterministic added/modified/deleted paths. The baseline is also the recovery anchor if OpenCode restarts during BUILD.

This removes the 6.0.11 failure mode where `fatal: not a git repository` prevented all engineering, without sacrificing changed-file evidence.
