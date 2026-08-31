# Compatibility — ADE 6.1.3

Target runtime: OpenCode V2 Promise plugin API. Worker-contract decisions are pinned to OpenCode `0.0.0-beta-18743`, source commit `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.

## Host/session contract

ADE uses `session.create`, `session.get`, `session.switchAgent`, `session.switchModel`, `session.prompt`, `session.wait`, `session.context`, and optional `event.subscribe`. The Event API is feature-detected; worker execution remains supported through polling/heartbeat when it is absent or degraded.

The event adapter accepts both higher-level `message.*` / `session.status` events and beta-18743 low-level `session.text.delta`, `session.tool.*`, and `session.execution.*` aliases. ADE owns the public normalized schema so host event naming can change without changing the durable control plane. Reasoning delta text is deliberately not part of that schema.

## Historical project compatibility

SAFE_AUTO_REPAIR remains bounded to ADE-owned configuration and cannot authorize itself. Legacy process-check omissions are normalized only where the existing runner choice already establishes the check-level intent; explicit `allow_host_process=false` remains a hard veto. Docker omissions repair only toward restrictive defaults.

Migration supports v4/v5, ADE 6.0.x through 6.0.11, and ADE 6.1.0.

## Workspace compatibility

A valid Git repository uses Git-native change evidence. A project with no repository, or a host where Git is unavailable, can execute engineering in bounded filesystem-evidence mode. Nested/ambiguous/broken Git state is not treated as “no Git”; it blocks before workers start.
