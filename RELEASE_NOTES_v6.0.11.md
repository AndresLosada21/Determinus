# ADE 6.0.11 - Runtime Agent Catalog Registration

## Fixed

- Registers all ADE-managed agent definitions through the beta-18721 canonical `agents` configuration map instead of relying on Markdown files under the global config directory.
- Preserves the five active durable-kernel roles and the thirteen explicitly disabled legacy tombstones.
- Validates the canonical OpenCode agent catalog with bounded startup retry; file presence is no longer treated as runtime availability.
- Makes `ade_doctor` report `ADE_DOCTOR_AGENT_CATALOG_INVALID` when a required active role is absent from the host catalog.

## Safety

The reconciler only adds or updates definitions it previously recorded as ADE-managed. It preserves user agents and fails closed if a user-owned definition collides with an ADE-managed ID. It does not change permissions, providers, grants, network policy, or external state.
