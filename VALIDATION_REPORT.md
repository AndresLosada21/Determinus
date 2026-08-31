# Validation report - ADE 6.1.3

- Python package regression: `38/38` groups pass on the clean distributable tree.
- Plugin tests: `115/115` pass.
- TypeScript typecheck: pass (`tsc -p tsconfig.json --noEmit`).
- Static policy: pass (`STATIC_POLICY_OK`).
- Observation-specific coverage: native event projection, beta-18743 low-level event aliases, strict redaction with reasoning-payload suppression, canonical/noncanonical journal isolation, live current-worker projection, `session.get` + metadata-only `session.context` polling fallback, degraded-event recovery, parent-bound completed-worker inspection, reconcile/reattach, and persisted-worker adoption all pass.
- Workspace coverage: valid Git uses Git evidence; no Git uses a bounded persisted filesystem baseline/diff; inconsistent or nested VCS fails closed before worker token spend; filesystem BUILD recovery reuses the persisted pre-build baseline.
- Host contract: pinned to OpenCode2 `0.0.0-beta-18743`, source `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.
- Real-host 6.1.1 canary: installation/kernel/event-capture PASS; parent-visible live projection FAIL/not demonstrated during a ~3m41s ANALYZE worker. This finding is the reason for 6.1.3.
- 6.1.3 local projection contract: parent-linked worker session plus Task-compatible `metadata.sessionId`/`metadata.summary` is regression-tested.
- Live target-host canary for 6.1.3: **pending**. Only the target OpenCode TUI can certify visual delivery after installation/restart.

- Flow-unblock coverage: a human-authorized policy with `checks:{}` auto-provisions the supported standard verifier presets; explicit vetoes and unknown checks remain blocked before worker token spend.
- Workflow VERIFY coverage: authorized policy-owned checks run without redundant per-check chat grants and are definition-snapshotted against TOCTOU.
