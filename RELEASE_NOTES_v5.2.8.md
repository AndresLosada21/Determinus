# ADE v5.2.8 — Managed Delegation Runtime

## Why this release exists

Real project execution exposed a lifecycle defect in prompt-driven subagents: a child with `ADE_DELEGATION_CONTEXT: COMPLETE` still re-read canonical state/contracts, an Engineer could spend most of its step budget on discovery before delegating, native nested delegation could be interrupted while `Delegating…`, and a child that reached the OpenCode final step lost tool access before `ade_handoff_submit`. The parent could then improvise with shell/manual `gh` fallbacks.

v5.2.8 moves ADE delegation mechanics into the plugin runtime.

## Managed delegation

- New typed tool: `ade_delegate` (29th ADE tool).
- Raw native `subagent` is hidden and denied for all ADE agents.
- Runtime DAG:
  - orchestrator → product-owner | project-manager | engineer
  - project-manager → tracker-operator
  - engineer → explorer | researcher | modeler | engineering-planner | tester | implementer | verifier | debugger | reviewer | security-reviewer | integrator | documenter | vcs-operator
  - workers have no child authority.
- `required_child` is enforced before child-session creation and is one-shot.
- Fan-out is bounded to 3 and managed depth to 2.
- Coordinators with a pending `required_child` get at most 2 discovery actions before the runtime blocks further discovery.
- `ADE_DELEGATION_CONTEXT: COMPLETE` is now runtime state, not prompt convention: Skill/raw subagent are removed; canonical rehydration reads are denied unless explicitly required; `DISCOVERY_ALLOWED=false` removes discovery tools.
- `ade_delegate` creates a child session, switches agent/model, prompts, waits synchronously for terminal state, reads child context and returns the handoff/result to the parent.
- If OpenCode removes tools on the final step and no handoff was emitted, ADE persists a runtime `PARTIAL` fallback handoff. It is never promoted to `DONE`.
- Managed child failures are returned as `ADE_DELEGATION_BLOCKED`; the runtime interrupts the child and emits a BLOCKED fallback when possible.

## Provider compatibility retained

The v5.2.7 narrow OpenCode Zen auto-only `tool_choice` compatibility shim is retained. Exact-effect external grants, grant-store isolation, TOCTOU revalidation, deterministic tracker operations, VCS/Docker/filesystem/secret hardening and circuit-breaker semantics are unchanged.

## Validation target

Source gates: 44 Python groups, 93 Node tests, TypeScript and Static Policy. Release state remains `SOURCE_HARDENED_VALIDATED_RUNTIME_PENDING` until v5.2.8 is revalidated on the real Windows/OpenCode/provider host.
