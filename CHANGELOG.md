# Changelog

## 6.1.3

- Fix real-host worker projection discovered by the 6.1.1 beta-18743 canary.
- Parent-link kernel worker sessions to the orchestrator session.
- Project Task-compatible `metadata.sessionId` and child tool `metadata.summary`.
- Separate observation capture mode from UI delivery/visibility claims in `ade_doctor`.
- Preserve noncanonical observation journal, polling fallback, durable recovery, filesystem evidence, and reasoning-payload suppression.

## 6.1.1

- Consolidates the two independent 6.1.0 implementations after code/test review.
- Keeps the durable noncanonical Observation Plane, event journal, heartbeat/context fallback, worker reattach and persisted-worker adoption.
- Adds beta-18743 low-level event aliases (`session.text.delta`, tool/execution events) while suppressing reasoning payload text.
- Adds parent-bound `/ade-worker` completed-output inspection with redaction and recent worker observations.
- Makes Git optional for engineering only when no repository is present: BUILD uses bounded external filesystem baseline snapshots and deterministic changed-file evidence. Inconsistent or nested VCS still fails closed before worker creation.
- Filesystem BUILD recovery reuses the persisted external baseline after restart/reconcile.
- Dead lock owners are reclaimed immediately; live lock owners are never stolen.

## 6.1.0

- Added a noncanonical live Observation Plane backed by OpenCode V2 `event.subscribe`, with heartbeat-only/degraded fallback.
- Added worker-session correlation, `ade_worker_events`, live `current_worker`, richer `/ade-trace` and `/ade-why`, and reconcile/reattach support.
- Preserved the hash-chained durable kernel as the exclusive workflow authority; observation events cannot mutate canonical state.
- Added engineering Git admission preflight and `VCS_PRECONDITION` failure classification before worker token spend.
- Updated the pinned OpenCode2 contract to `0.0.0-beta-18743` / source `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.

## 6.0.11

- Registers managed ADE agents through the canonical OpenCode `agents` configuration map.
- Validates the runtime agent catalog before reporting runtime readiness.
- Preserves user-owned agent definitions and fails closed on ID collisions.
- Reconciles safe historical project-policy omissions without bypassing authorization.
- Host validated on OpenCode `0.0.0-beta-18721`.
