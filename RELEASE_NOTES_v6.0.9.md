# ADE 6.0.9 — Beta-18721 Worker Contract & Release Integrity

**Release state:** `SOURCE_VALIDATION_IN_PROGRESS` until the final extracted bundle, fresh-install and migration gates are sealed. `HOST_VALIDATED` is not claimed.

## Adopted from the technical review

- Preserve the host-validated 6.0.7 worker `SystemPart` correction and centralize worker text parts through one canonical constructor.
- Require `time.completed` for canonical V2 assistant messages before they become durable worker evidence; explicit legacy parser compatibility remains isolated.
- Complete the local Promise `session.prompt` type shim with `id?: string`.
- Convert lifecycle mocks to canonical V2 admission → wait → settled assistant shapes.
- Add permanent `INC-BETA18721-WORKER-ZERO-TOKEN` coverage across all four worker agents.
- Distinguish deterministic worker domains: `WORKER_EXECUTION_FAILED`, `WORKER_INTERRUPTED`, `WORKER_TIMEOUT`, and `WORKER_INVALID_OUTPUT`. Terminal execution/output failures no longer fall into a blind generic retry.
- Add release-surface consistency checks so current primary docs, metadata, test-count claims, wrapper names and package version cannot silently drift.

## Rejected / deferred

Bounded same-ID wake recovery is not included. The pinned beta source reconciles an identical message ID and calls `wake`, but its coordinator already registers the busy period synchronously, serializes one execution per session, and coalesces doorbells. No observed host failure requires an extra successor wake, so correctness is favored over speculative recovery.

## Preserved from 6.0.8

Engineering policy preflight remains fail-fast and read-only: missing/unauthorized `.ai/execution-policy.json` or invalid requested checks block before the DAG and before any worker token spend. No policy is auto-created or auto-authorized.
