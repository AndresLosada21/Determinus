# Deterministic Control Plane — ADE v5.2.5

v5.2.5 moves mechanical orchestration out of LLM behavior wherever the runtime already has enough structured information.

## Rule

**LLMs decide content; ADE decides mechanics.**

The canonical route is derived by `ade_route_snapshot`. Product/Delivery/Engineering state transitions are performed by typed tools. GitHub Project V2 synchronization is performed directly by typed runtime adapters owned by Project Manager, not by a mandatory tracker subagent.

## GitHub Projects V2 primary path

Project Manager owns two deterministic capabilities:

- `ade_tracker_project_snapshot`: resolve configured Project V2, fields, selectable options/iterations and items.
- `ade_tracker_project_sync`: batch desired field values, map field/option/iteration IDs, update via GitHub GraphQL, read back, verify, persist an audit receipt and emit a runtime canonical handoff.

`tracker-operator` remains a compatibility/fallback leaf for generic provider operations or ambiguity that cannot be represented by the deterministic adapter.

The sync result reports `requested`, `updated`, `verified`, `failed`, per-field verification, `canonical_handoff` and `post_state`. A successful write is not reported as validated until the value is observed on the post-write snapshot.

## Runtime-generated handoffs

State transitions and deterministic tracker syncs produce `origin=runtime` handoffs. Agents must not publish a second handoff for the same operation. Runtime handoffs do not increment canonical state revision; state transitions themselves do.

## Failure circuit breaker

Provider failures are normalized into signatures. `tool_choice` auto-only incompatibility is deterministic and receives zero retries. `reasoning item expired` is treated as transient but gets at most one retry for the same session/agent/provider/model/signature. Repeated identical signatures open the circuit.

Use `/ade-failures` to inspect recent signature/domain/retry decisions without exposing prompts or tool arguments.

## Post-operation state

The Orchestrator must read one `ade_route_snapshot` after owner mutations/acceptance/remote operations and before the user brief. Canonical post-state has precedence over child prose.

## Validation boundary

Installation/migration, Core/Contract validation, Behavioral Assurance and Live Matrix remain separate responsibilities. Migration does not run behavioral trials. Behavioral reliability is evidence about a model/provider, not a prerequisite for copying managed files.

## Managed delegation (v5.2.8)

Reasoning delegation now follows the same control-plane principle: the LLM decides delegated content, while `ade_delegate` controls the allowed DAG, child lifecycle, context contract, wait semantics and fallback handoff. Mechanical tracker/state operations remain deterministic typed tools and do not gain new LLM hops.
