# ADE 6.0.0 — Durable Engineering Runtime

ADE 6 is a major architectural replacement of the v5 agent hierarchy. The kernel now owns scheduling and durable state; LLMs are disposable workers.

## Major changes

- 5 active agents instead of 18 active organizational roles.
- 13 former roles remain only as disabled rollback-compatible tombstones.
- 34 registered typed tools; only kernel/gateway-safe surfaces are exposed to active agents.
- External per-project hash-chained event journal with derived snapshots.
- Kernel-owned worker sessions using OpenCode session lifecycle primitives.
- No worker-to-worker delegation; the complete v5 Managed Delegation implementation (`DELEGATION_DAG`, child metadata/rehydration runtime and `ade_delegate`) is physically removed from the v6 runtime/tool registry.
- Workflow DAGs for analysis, engineering, implementation proposal and deterministic tracker sync.
- Leases, bounded attempts and reconciliation for stale jobs.
- Engineering requires deterministic project checks before `DONE`.
- Multi-check progress survives `WAITING_APPROVAL` without respawning the Verifier or reusing consumed grants.
- Builder jobs are project-serialized and reject dirty non-`.ai` baselines.
- v5 exact-effect grants, secret boundaries, VCS/Tracker hardening, provider auto-only compatibility and circuit breakers are retained.
- Managed migration 5.2.8 → 6.0.0 and byte-identical rollback of representative v5.2.8 managed files are release-gated.

## State migration

v6 does not promote `.ai/control.json` to canonical state. Existing project state is preserved on disk and imported once as a non-authoritative legacy snapshot event when the v6 kernel initializes that project.

## Release state

The source release is sealed only after deterministic source, plugin and lifecycle gates pass. Real OpenCode/provider validation remains a separate runtime gate.
