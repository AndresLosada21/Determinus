# Managed Delegation Runtime

ADE v5.2.8 replaces prompt-driven native subagent mechanics with `ade_delegate`.

## Rule

**LLMs decide delegated content; ADE owns delegation mechanics.**

`ade_delegate` validates the parent→child DAG, required child, depth/fan-out and context policy; creates the child session; switches to the requested agent; inherits the parent model when available; prompts the child; waits synchronously; reads terminal context; then returns a canonical agent handoff or a non-authoritative runtime fallback.

## COMPLETE context

`ADE_DELEGATION_CONTEXT: COMPLETE` is persisted as runtime metadata. A managed child must use `authoritative_inputs` instead of rehydrating canonical state by habit. `control.json` is never re-read by a COMPLETE child. Canonical contracts/checkpoints may only be read when the required action explicitly names them. `skill` and native `subagent` are unavailable. With `DISCOVERY_ALLOWED=false`, read/glob/grep/web discovery is unavailable as well.

## Required child

When a coordinator receives `required_child`, only that exact child may be created. The grant is one-shot. A coordinator may perform at most two allowed discovery actions before satisfying the required delegation.

## Lifecycle

```text
parent
  → ade_delegate
  → validate DAG/budget
  → session.create
  → session.switchAgent (+ switchModel best-effort)
  → session.prompt
  → session.wait
  → session.context
  → canonical handoff OR runtime PARTIAL fallback
  → return to parent
```

The call is synchronous. A parent does not finish its managed delegation while the child is still running.

## Final-step fallback

OpenCode can remove tools on an agent's final allowed step. If the child returns factual text without `ade_handoff_submit`, ADE records `origin=runtime`, `status=PARTIAL`, `operation=delegation.fallback`. This preserves the result without claiming a completed governed handoff.
