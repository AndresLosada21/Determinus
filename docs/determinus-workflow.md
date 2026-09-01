# ADV Workflow Diagram

ADV is a **7-gate collaborative workflow**. Each gate is owned by a specific command and enforced in sequence — you cannot complete a gate until prior gates are satisfied.

See also:
- [docs/determinus-gates.md](determinus-gates.md) for gate-by-gate behavior
- [docs/determinus-autonomy-compliance-matrix.md](determinus-autonomy-compliance-matrix.md) for agent-decides vs user-confirms boundaries

## Gate Sequence

```
┌───────────────────────────────────────────────────────────────────────┐
│                  ADV 7-GATE COLLABORATIVE WORKFLOW                    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  /determinus-proposal "summary"                                              │
│       │                                                               │
│       ▼                                                               │
│  ┌─────────────┐                                                      │
│  │ 1. proposal │  change.documents.problemStatement +                │
│  │             │  change.documents.proposal                           │
│  └──────┬──────┘                                                      │
│         │ /determinus-discover                                               │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 2. discovery│  context analysis → change.documents.agreement       │
│  └──────┬──────┘                                                      │
│         │ /determinus-design                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 3. design   │  architecture → change.documents.design              │
│  └──────┬──────┘                                                      │
│         │ /determinus-prep                                                   │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 4. planning │  task graph, sequencing, TDD intent                  │
│  └──────┬──────┘                                                      │
│         │ /determinus-apply  (tasks run through /determinus-review inline)          │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 5. execution│  code, docs, ops deliverables                        │
│  └──────┬──────┘                                                      │
│         │ /determinus-review                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 6. acceptance│ user sign-off against change.documents.acceptance    │
│  │             │ + change.documents.executiveSummary                 │
│  └──────┬──────┘                                                      │
│         │ /determinus-harden                                                 │
│         ▼                                                             │
│  ┌─────────────┐                                                      │
│  │ 7. release  │  hardening pass → /determinus-archive applies deltas + wisdom│
│  └──────┬──────┘                                                      │
│         │                                                             │
│         ▼                                                             │
│  ┌──────────┐                                                         │
│  │ ARCHIVED │  ◄─── Specs updated, durable wisdom captured, archived  │
│  └──────────┘                                                         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Narrative artifacts persist only in `change.documents.{kind}` inside the active change projection. Markdown files materialize only in archive bundles through `writeArchiveBundleFiles`.

## Gate Ownership

| Gate       | Owning command        | Produces                     |
|------------|-----------------------|------------------------------|
| proposal   | `/determinus-proposal`         | `change.documents.problemStatement`, `change.documents.proposal` |
| discovery  | `/determinus-discover`         | `change.documents.agreement`                 |
| design     | `/determinus-design`           | `change.documents.design`                    |
| planning   | `/determinus-prep`             | Task graph in `change.json`    |
| execution  | `/determinus-apply`            | Code / docs / ops deliverables |
| acceptance | `/determinus-review` | `change.documents.acceptance`, `change.documents.executiveSummary`, `contract.reviewMatrix` |
| release    | `/determinus-harden` + `/determinus-archive`| Spec deltas applied, git finalized |

Gates are sequential — `/determinus-harden` is blocked until `acceptance` is done, `/determinus-archive` is blocked until all 7 are satisfied. See [docs/determinus-gates.md](determinus-gates.md) for the full gate contract.

See [Per-Gate Line-Item Map](#per-gate-line-item-map) in [docs/determinus-gates.md](determinus-gates.md) for the canonical per-gate task/artifact/writer/approval map.

## Re-Entry Flow (Scope Expansion)

Gates are normally forward-only, but mid-change scope expansion can route back through earlier gates via `determinus_change_reenter`:

```
                          ┌──────────────────────────────────────────────┐
                          │         RE-ENTRY (SCOPE EXPANSION)           │
                          │                                              │
                          │  During execution, new scope discovered:     │
                          │                                              │
                          │  determinus_change_reenter(fromGate: "discovery")   │
                          │       │                                      │
                          │       ▼                                      │
                          │  Cascade reset: discovery → design →         │
                          │    planning → execution → acceptance →       │
                          │    release all reset to PENDING              │
                          │                                              │
                          │  Upstream gates (proposal) stay DONE         │
                          │  Existing tasks & completed work PRESERVED   │
                          │                                              │
                          │  Walk reopened gates normally:               │
                          │  /determinus-discover → /determinus-design → /determinus-prep    │
                          │    → /determinus-apply (resume)                    │
                          └──────────────────────────────────────────────┘
```

Re-entry is recorded in `reentry_history[]` on the change for audit. See [docs/determinus-gates.md](determinus-gates.md) for cascade reset semantics and constraints.

## Fast-Track

For small, well-understood durable work, `/determinus-task` fast-tracks a tracked change by assessing spec-law impact, synthesizing the proposal, discovery, design, and planning gates, and creating task state before implementation. Execution and acceptance still run through `/determinus-apply` + `/determinus-review` as normal.
