---
name: determinus-backlog
description: Capture future work as backlog-status changes before proposal
requiresChangeId: false
---

<!--
  Spec citations:
    rq-backlogDurability01, rq-backlogFormat01, rq-backlogLifecycle01,
    rq-backlogPromotion01, rq-backlogArchive01, rq-backlogSchemaVersion01,
    rq-backlogConcurrency01, rq-backlogEpicBridge01
-->

# ADV Repo Backlog — Capture Future Work

Add, inspect, promote, and close lightweight future-work changes with `status: "backlog"` — durable, branch-local, and promotable to a normal ADV change or Epic shell entry.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** a confirmed backlog change, list, promotion, or close action using typed change tools.

**× MUST NOT:** create implementation tasks, complete gates, add CLI mutation verbs, or read ADV state files directly.

**Gate:** None.

## Boundary vs Nearby Commands

- `/determinus-backlog` — capture, inspect, or promote repo-level future work.
- `/determinus-epic` — create or update initiative containers; can import backlog changes as shell entries.
- `/determinus-proposal` — create a normal ADV change for one work item.
- `/determinus-triage` — coalesce overlapped changes↔issues and surface portfolio balance; does not mutate repo backlog state.

## Phase 1: Frame the Item

1. Restate the future work in one sentence.
2. Confirm:
   - backlog item title
   - success hint / rough acceptance criteria
   - optional explicit id (auto-generated if omitted)
3. If the request is clearly an active change or Epic, recommend `/determinus-proposal` or `/determinus-epic` instead.

## Phase 2: List or Inspect Before Mutation

Use typed change tools only:

| Purpose                       | Tool                |
| ----------------------------- | ------------------- |
| List active backlog changes   | `determinus_change_list filter: {status: "backlog"}`  |
| Show one backlog change       | `determinus_change_show`  |
| Add a new backlog change      | `determinus_change_create status: "backlog"`   |
| Promote a backlog change      | `determinus_change_update` (transition status to proposal) |
| Close a stale backlog change  | `determinus_change_close` |

Rules:

- Heuristics may rank likely duplicates, but typed reads plus user choice own the decision.
- Surface evidence neutrally; do not hide a default recommendation.
- If the read fails, stop before mutation and surface the tool error/remediation.

## Phase 3: Duplicate / Overlap Decision

If no plausible overlap exists, proceed to mutation.

If a similar active item exists, present the evidence and ask the user to choose exactly one:

| Option          | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| update existing | Use `determinus_change_update` on the same change to append current context |
| add anyway      | Create a distinct item with a new auto-generated id                  |
| promote         | Use `determinus_change_update` to transition the backlog change to proposal |
| stop            | Do not mutate backlog state                                          |

× MUST NOT update a clear duplicate until the user chooses `add anyway`.

## Phase 4: Mutate Through Typed Backlog Tools

After confirmation:

1. Add the backlog change with `determinus_change_create status: "backlog"`.
2. Promote it with `determinus_change_update` when the user is ready.
3. Close stale backlog changes with `determinus_change_close`.

### Epic bridge

To import a backlog change into an Epic as a shell entry, create the shell with `determinus_change_create parent_epic_id: {epic_id} shell: true`. Carry the backlog change ID as `origin_source_artifact` or equivalent provenance. The shell title and success hint derive from the backlog change unless explicitly overridden; later backlog edits do not update the shell.

× MUST NOT directly edit `.adv/backlog.jsonl` or ADV state files.

## Output

Emit a compact final report:

- Backlog item id and title
- Action taken (added/promoted/archived/listed)
- Promotion target, if any
- Remaining follow-up actions, or `None`
