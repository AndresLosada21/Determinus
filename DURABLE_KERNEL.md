# ADE 6.0.1 Durable Kernel

## Architecture

ADE 6 is a local durable workflow runtime. Agents are workers; they are not the control plane.

```text
User
  ↓
Orchestrator gateway
  ↓ intent
ADE Kernel
  ├─ event journal / snapshot
  ├─ workflow state machine
  ├─ scheduler / leases / reconciliation
  ├─ context capsules
  ├─ exact-effect authorization
  └─ deterministic activities
       ↓
 OpenCode worker sessions
 Analyst / Builder / Verifier / Reviewer
```

## Invariants

1. Only the kernel schedules workers.
2. Workers cannot delegate or use raw shell.
3. Canonical workflow state is never derived from LLM prose.
4. `engineering` cannot start without at least one deterministic check name.
5. Deterministic check output, not the Verifier's claim, supplies validation authority.
6. External mutations require exact-effect grants and read-back where supported.
7. Mutation retry is never used as a substitute for reconciliation.
8. A corrupt event chain is `SAFE_READ_ONLY`.
9. Job retries are bounded and represented in the journal.
10. A dirty non-`.ai` baseline blocks Builder start.

## Event sourcing

The canonical per-project store is outside the repository. `events.jsonl` is append-only under a file lock. Each event commits:

```json
{
  "seq": 42,
  "type": "JOB_PATCH",
  "payload": {},
  "prev_hash": "...",
  "event_hash": "..."
}
```

`event_hash` is SHA-256 over canonical event material. On load the complete chain is verified. `snapshot.json` is regenerated from the journal and is not trusted as canonical input.

The file-backed backend is intentional for v6.0: it avoids a native SQLite dependency across OpenCode/Bun/Windows while preserving a backend-neutral event contract. A future SQLite backend can implement the same journal semantics.

## Workflow and jobs

A workflow owns immutable intent and a DAG of jobs. Jobs transition through states such as `CREATED`, `READY`, `RUNNING`, `WAITING_APPROVAL`, `DONE` and `BLOCKED`.

A running job owns a lease with an expiry. `ade_kernel_reconcile` interrupts stale worker sessions when possible and either returns a bounded-attempt job to `READY` or blocks it.

## Worker lifecycle

The scheduler creates workers synchronously:

```text
session.create
→ session location check
→ switchAgent
→ optional switchModel
→ prompt immutable context capsule
→ wait
→ context
→ persist result
```

Workers never create another worker. The legacy `ade_delegate` implementation and tool surface are physically absent in v6; only the durable kernel scheduler may create worker sessions.

## Context capsule

Workers receive an immutable, job-scoped capsule generated from durable workflow state. The capsule contains objective, role/job information, dependencies and relevant workflow data. The worker result is bounded and journaled, but remains advisory until deterministic activities validate facts that require validation authority.

## Engineering workflow

```text
ANALYZE
  ↓
BUILD
  ↓
VERIFY worker proposal
  ↓
deterministic project check(s)
  ↓
REVIEW
  ↓
DONE
```

Builder jobs are serialized by a per-project mutation lock and refuse a dirty non-`.ai` starting worktree.

When multiple checks are configured, every successful check result is persisted immediately. If check 2 needs a grant, the job becomes `WAITING_APPROVAL` while check 1 stays durable. Resume skips the already-completed check and does not respawn the Verifier LLM.

## Tracker workflow

`tracker_sync` is a deterministic kernel activity, not a PM/Tracker LLM chain. The activity resolves the exact target, requires a matching external grant, performs mutation, reads back the remote state and records the result.

## Safe mode

Any event-chain mismatch, oversized journal or unsafe external store path fails closed. Read/status operations report `SAFE_READ_ONLY`; mutation/workflow execution is blocked until the corruption is diagnosed rather than guessed around.

## Workflow-start UX contract (6.0.1)
`ade_workflow_start` is a durable state transition, not a background worker. It writes the workflow/job DAG to the journal and returns `WORKFLOW_STARTED`, the `workflow_id` and `next_action`. Worker sessions start only when `ade_workflow_run` executes. `/ade-workflow` exposes the active workflow and next job so the TUI never needs to treat a custom tool row as a clickable task card.
