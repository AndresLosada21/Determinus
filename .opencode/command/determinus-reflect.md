---
name: determinus-reflect
description: "Produce a structured two-plane reflection report for an archived change"
phaseGoal: "Synthesize post-completion learnings into a durable reflection artifact for process improvement."
---

# ADV Reflect — Two-Plane Reflection Report

Produce two-plane reflection for archived change: project execution + system friction. Reflection is informational and non-blocking from `/determinus-archive`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("determinus-reflect")` → two-plane dimensions, friction taxonomy, metric synthesis, REFLECTION.md template, persistence rules.

Required — if the skill fails to load, stop and report a broken deploy (run scripts/deploy-local.sh --fix).

## Exits

| Exit | Condition |
|---|---|
| ✅ Complete | Reflection persisted and REFLECTION.md written |
| ⚠️ Warning | Reflection failed; non-blocking from archive |
| 🎤 Blocked | Change not archived |

## Target Resolution

Parse `$ARGUMENTS`: `change-id` required. If empty, use `determinus_change_list` → auto-select single candidate or ask via `question`.

---

## Phase 1: Load Change

1. `determinus_change_show changeId: <target>`.
2. Verify status is `"archived"`; if not, emit REFLECTION BLOCKED and stop.
3. Extract title, tasks, wisdom, gates, error_recovery logs, cancellations.

---

## Phase 5: Persist

1. Call `determinus_reflect changeId: <target>`; report persists to `reflections.jsonl`.
2. Write `{archiveDir}/{date}-{change-id}/REFLECTION.md` using skill template.
3. Content includes change ID/title, Plane 1 metrics, Plane 2 friction table, highlights, improvement suggestions, footer.

---

## Phase 6: Present Report

### Archive-visible summary

When invoked from `/determinus-archive`, return one concise line that the archive terminal report can include:

- `Reflection: completed: {reflection-id}; {friction-count} friction item(s); REFLECTION.md: {path}`
- On failure: Reflection: failed: <reason>; nonblocking — rerun `/determinus-reflect <change-id>` later

---

## Error Handling

| Error | Action |
|---|---|
| Change not archived | Block; require `/determinus-archive` first |
| `determinus_reflect` fails | Warn, emit REFLECTION WARNING, stop; when called from archive, return archive-visible failed summary |
| REFLECTION.md write fails | Warn, emit REFLECTION WARNING, stop; when called from archive, return archive-visible failed summary |

When invoked from `/determinus-archive`, reflection failure MUST NOT block archive flow: catch error, emit `[ADV:WARN] Reflection generation failed: {reason}; does not block release`, continue archive, and show rerun `/determinus-reflect <change-id>` later in the archive-visible summary.

---

## Command Boundary

| Produces | × MUST NOT |
|---|---|
| Reflection report (JSON + Markdown) | Mutate change state, tasks, or gates |
| Friction analysis | Create tasks or changes |
| Improvement suggestions | Block archive flow when called from it |

- Only `/determinus-archive` may trigger `/determinus-reflect` as optional post-step.
- `/determinus-reflect` does NOT complete gates.
- Reflection is idempotent: rerun overwrites `reflections.jsonl` entry and REFLECTION.md.

## Key Tools

| Purpose | Tool |
|---|---|
| Load change | `determinus_change_show` |
| Persist | `determinus_reflect` |
| Wisdom | `determinus_wisdom_list` |
