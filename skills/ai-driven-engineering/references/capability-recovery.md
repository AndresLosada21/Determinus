# Capability Denial Recovery

Permission denial is evidence about one attempted `action + resource`, not proof that an entire tool family is unavailable.

## Canonical invariants

`DENIAL_SEMANTICS: ACTION_RESOURCE_SCOPED`

`DENIAL_GLOBAL_INFERENCE: FORBIDDEN`

`AUTHORIZED_FALLBACK: REQUIRED_WHEN_AVAILABLE`

`CROSS_PLANE_HANDOFF: ORCHESTRATOR_ROUTED`

When an action is denied:

1. Record the exact attempted action/resource and the observed deny/error.
2. Do **not** generalize `shell denied`, `Git unavailable`, `tracker unavailable`, `Docker unavailable`, or equivalent from a single failed resource.
3. Check whether an already-authorized, narrower interface can establish the same evidence. Use it once when available.
4. If the required evidence belongs to another authority plane, return `PARENT_EXECUTION_REQUIRED` with `required_owner` and `execution_owner`; do not impersonate the owner and do not hand the command to the user.
5. The parent either executes an action already inside its own authority, delegates to the correct specialist, or propagates a cross-plane handoff to the Orchestrator.
6. The Orchestrator routes cross-plane handoffs to an allowed owner automatically. Human interaction is only for a real human gate, credential/secret, irreversible external effect, or information unavailable to the runtime.

## Recovery matrix

| Observed need / deny | First safe recovery | Escalation when still unavailable |
| --- | --- | --- |
| raw `git -C ...` / Git metadata in another workspace | `git-readonly.ps1` | `PARENT_EXECUTION_REQUIRED`, `required_owner: engineer` |
| GitHub/Jira/Linear issue/project evidence requested inside Engineering discovery | do not retry raw provider commands | `PARENT_EXECUTION_REQUIRED`, `required_owner: project-manager`, `execution_owner: tracker-operator` |
| project/container runtime check | registered `run-project-check.ps1` via Verifier | `PARENT_EXECUTION_REQUIRED`, `required_owner: engineer`, `suggested_specialist: verifier` |
| validation command denied inside Implementer (ex.: `php -l`) | do not retry arbitrary shell variants; implementation remains `IMPLEMENTED_NOT_VALIDATED` | `PARENT_EXECUTION_REQUIRED`, `required_owner: engineer`, `execution_owner: verifier` |
| product scope/acceptance fact | no Engineering emulation | `PARENT_EXECUTION_REQUIRED`, `required_owner: product-owner` |
| delivery readiness/dependency/provider state | no Engineering emulation | `PARENT_EXECUTION_REQUIRED`, `required_owner: project-manager` |

## Required escalation envelope

A specialist escalation should preserve enough evidence for the parent to route without rediscovery:

- `status: PARENT_EXECUTION_REQUIRED`
- `denied_action`
- `denied_resource`
- `observed_error`
- `capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY`
- `requested_evidence`
- `authorized_fallback_attempted`
- `required_owner`
- `execution_owner` or `suggested_specialist` when applicable
- `reason`
- `safe_next_action`

If a specialist cannot obtain a fact after the authorized fallback, that **fact** may remain `DESCONHECIDO`; the whole tool family must not be declared unavailable unless broader evidence actually establishes that.
