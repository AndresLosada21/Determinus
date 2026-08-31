# Host Validation - ADE 6.0.11

## Validated environment

- OpenCode `0.0.0-beta-18721`
- Plugin `ai-driven-engineering.native` `6.0.11`
- Runtime catalog contains `orchestrator`, `explorer`, `implementer`, `verifier`, and `reviewer`.
- `ade_doctor` reports `ADE_DOCTOR_OK` and `required_agents_ready:true`.

## Durable workflow canaries

- Analysis workflow reached `DONE`.
- Engineering workflow reached `DONE` through `ANALYZE`, `BUILD`, `VERIFY`, and `REVIEW`.
- `host-runtime-smoke` ran `node --version` with exit code `0` after the required exact-effect grant.
- The policy reconciler added missing `allow_host_process:true` only for a historical `runner:"process"` entry and preserved all explicit denials.

## Integrity

- Runtime catalog: 5 required roles discovered.
- Regression suite: `36/36` pass.
- Plugin suite: `104/104` pass.
- TypeScript and static-policy checks pass.
- No remote mutation occurred during canary validation.
