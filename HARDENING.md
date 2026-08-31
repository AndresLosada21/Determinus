# Hardening — ADE 6.1.0

ADE 6.1.0 introduces bounded self-healing without self-authorization.

## Recovery classes

- `SAFE_AUTO_REPAIR`: ADE-owned missing policy, known schema-1 omissions, restrictive Docker defaults, legacy process-runner field normalization and missing ADE-managed agent registrations.
- `HUMAN_GATE`: policy authorization, exact-effect check execution, network, workspace writes, remote/VCS effects and any explicit deny reversal.
- `FAIL_CLOSED`: malformed JSON, unsupported schema, ambiguous definitions, secrets, path-boundary violations or unknown state.

Self-heal runs once during engineering admission. It is deterministic, preserves unknown fields, never converts `authorized:false` to true, never changes `allow_host_process:false`, and does not issue external grants.

A project declaring `runner=process` is interpreted as opting into the hardened process runner unless it explicitly declares `allow_host_process:false`. Execution remains protected by policy authorization plus the existing exact-effect single-use external grant. Generic shells remain blocked, PATH resolution excludes project executables, environment is minimal, arguments are bounded and the working directory is project-contained.
