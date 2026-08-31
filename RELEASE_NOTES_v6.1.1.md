# ADE 6.1.1 - Consolidated Durable Observable Runtime

ADE 6.1.1 reconciles two independent ADE 6.1.0 implementations. The durable kernel remains the only authority for workflow transitions, leases, exact-effect grants and verification. A separate noncanonical Observation Plane explains live worker execution without being able to mutate canonical state.

## What was retained from the observation-first 6.1.0

- Native `ctx.event.subscribe` observation around kernel-created worker sessions.
- Internal worker-session registry with hashed public session refs.
- Live `t.progress()` projection while `session.wait()` remains synchronous.
- Separate bounded/rotated `observations.jsonl`; canonical `events.jsonl` remains hash chained.
- `ade_worker_events`, live `current_worker`, `/ade-trace`, and `/ade-why`.
- `EVENT_NATIVE`, `EVENT_DEGRADED`, and `POLLING_FALLBACK` using `session.get` plus metadata-only `session.context` samples and heartbeat.
- `ade_kernel_reconcile` reattachment and `ade_workflow_run` adoption of the already-persisted RUNNING worker without creating a replacement.

## What was incorporated from the independently produced 6.1.0

- Beta-18743 low-level event aliases including `session.text.delta`, `session.tool.*`, and `session.execution.*`.
- Parent-bound `/ade-worker <job-id>` inspection of completed worker output, with redaction and recent observation events.
- Git-optional engineering intent when a repository is genuinely absent or Git is unavailable.

## Hardening added during consolidation

- `session.reasoning.delta` is reduced to presence/activity metadata; reasoning text is never projected or persisted.
- Git-optional BUILD does not run blind. Before the builder starts, ADE writes a bounded file-fingerprint baseline to the external kernel store. After the worker finishes, a second snapshot produces deterministic `changed_files` evidence.
- Filesystem baselines survive restart/reconcile and are reused when adopting a persisted RUNNING BUILD worker.
- Nested/inconsistent VCS still fails closed before any worker token is spent. A valid Git repository continues to use Git HEAD/status evidence.
- Dead lock owners are reclaimed immediately; live lock owners are never stolen.
- Lock contention and filesystem-observation failures have dedicated failure domains instead of being mislabeled as worker failures/timeouts.

## Host target

OpenCode 2 `0.0.0-beta-18743`, source commit `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.

## Compatibility

Existing ADE v6 canonical journals are preserved. Upgrade from supported v4/v5, ADE 6.0.x through 6.0.11, or either ADE 6.1.0 implementation with `migrate-to-v6.1.1.py` / `.ps1`.

## Safety invariant

**Events explain the run; events never control the run.** Raw worker session IDs, secrets, and model reasoning payloads are excluded from public observation surfaces.
