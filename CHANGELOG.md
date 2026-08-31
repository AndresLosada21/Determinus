# Changelog

## 6.0.11

- Registers managed ADE agents through the canonical OpenCode `agents` configuration map.
- Validates the runtime agent catalog before reporting runtime readiness.
- Preserves user-owned agent definitions and fails closed on ID collisions.
- Reconciles safe historical project-policy omissions without bypassing authorization.
- Host validated on OpenCode `0.0.0-beta-18721`.
