# ADE 6.1.0 implementation comparison and 6.1.1 consolidation

Two independent 6.1.0 implementations were reviewed against source and tests.

## Observation-first implementation

Strengths retained in 6.1.1:

- Separate noncanonical `observations.jsonl` plane.
- `ade_worker_events`, current-worker projection, `/ade-trace`, and `/ade-why`.
- Event API feature detection plus `EVENT_DEGRADED` / `POLLING_FALLBACK`.
- `session.get` + metadata-only `session.context` sampling and heartbeat.
- Reconcile reattachment and adoption of the persisted RUNNING worker.
- 35-tool orchestrator surface including `ade_worker_events`.

Gap found: it originally treated absence of Git as a hard engineering precondition and did not recognize all low-level beta-18743 worker events.

## Agent-produced implementation

Strengths incorporated in 6.1.1:

- Git-optional intent for genuinely non-Git projects.
- Low-level beta-18743 event aliases observed by its host-oriented tests.
- Parent-bound `/ade-worker` completed-output inspection.

Gaps found and corrected during consolidation:

- No separate persistent Observation Plane/journal.
- No event-stream fallback/degradation mode.
- No current-worker snapshot projection or durable worker adoption after restart.
- Git-optional BUILD returned `changed_files=[]` in filesystem mode, so mutations lacked deterministic changed-file evidence.
- Reasoning delta text was mirrored; 6.1.1 keeps only generic reasoning-activity metadata.
- Capability/tooling architecture remained `DURABLE_KERNEL` with 34 tools and omitted `ade_worker_events`.

## Consolidation decision

ADE 6.1.1 uses the observation-first implementation as the structural base because it preserves durable observability/recovery. It merges the agent implementation's useful host compatibility and Git-optional behavior, then strengthens filesystem evidence and reasoning privacy. The result is intentionally a patch release rather than choosing either 6.1.0 unchanged.
