# ADE 6.0.6 - OpenCode V2 Worker Message Contract Fix

ADE v6 patch release for the durable worker runtime.

Target: OpenCode V2 `0.0.0-beta-18721` (source commit `90fb6562ce09782c311040ba39a9d50edec6ad0e`).

## Fixed

- Durable workers no longer discard valid beta-18721 assistant output. OpenCode V2 `session.context()` returns `SessionMessageInfo[]` where assistant messages use `type: "assistant"` and `content[]`; ADE 6.0.5 only accepted `role`/`info.role`, causing `ADE_KERNEL_WORKER_INVALID_OUTPUT: empty assistant result`.
- `session.prompt()` is now treated as an inbox admission call. On beta-18721 it returns `SessionInboxUser`; ADE waits for `session.wait()` and reads the canonical assistant message from `session.context()`.
- `delivery: "steer"` is intentionally retained. The exact beta-18721 contract supports `steer | queue`; removing it was not the correct fix for this host build.
- Empty worker output remains fail-closed and now reports only sanitized context message kinds for diagnosis.

## Regression hardening

- The kernel test double now mirrors the beta-18721 V2 contract: prompt returns a user admission receipt and the assistant message appears in context after wait.
- Added a regression test that requires `type: "assistant"` handling.
- Expanded the local OpenCode V2 type shim for `create`, `wait`, `interrupt`, `switchModel`, and `steer | queue`.

## Validation boundary

This bundle can be source/unit/type/static validated outside the user's OpenCode host. Real provider/Windows host validation must still be performed by the user's agent after migration; the release does not claim that external validation in advance.
