# ADE 6.0.10 — Autonomous Project Self-Healing

## Why

Real host validation of 6.0.8 reached VERIFY but the official `register-project-check.ps1` process check could not run because native runtime required a field that the official registration path did not emit. More broadly, an existing project can contain missing or historical ADE configuration. Repeatedly surfacing these as late workflow failures wastes worker tokens and makes the mesh brittle.

## What changed

- Add one bounded SAFE_AUTO_REPAIR pass before engineering DAG creation.
- Secure-bootstrap missing `.ai/execution-policy.json` as `authorized:false`.
- Preserve unknown/custom policy fields while normalizing known schema-1 omissions.
- Treat `runner=process` as the check-level process opt-in; migrate legacy missing `allow_host_process` to true, while preserving explicit false as a hard veto.
- Keep the two meaningful human barriers: policy authorization and exact-effect single-use `/ade-authorize` before `ade_project_check` execution.
- Normalize Docker checks only toward restrictive defaults.
- Fail closed on malformed/unsupported historical state.
- Make `register-project-check.ps1` emit `allow_host_process` consistently.
- Ship direct managed migration wrappers for both 6.0.8 → 6.0.10 and 6.0.9 → 6.0.10.
- Fix the plugin runtime version constant so installed status and package metadata cannot diverge.

## Security

Self-healing cannot authorize itself, issue grants, enable network, enable workspace writes, reverse explicit denies or mutate remote state.
