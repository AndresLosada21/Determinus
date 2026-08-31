# Host Validation - ADE 6.1.3

## Pinned host contract

- Product: OpenCode 2 beta
- Version: `0.0.0-beta-18743`
- Source repository: `anomalyco/opencode`
- Source commit: `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`
- Required Promise APIs: `session.create`, `session.get`, `session.prompt`, `session.wait`, `session.context`, and `event.subscribe` when available.

## What the 6.1.1 real-host canary proved

The 6.1.1 plugin loaded on the target host, matched the pinned baseline, reported a healthy durable kernel, and completed a real analysis workflow. That proves installation, durable execution and event-capture capability.

It did **not** prove live parent-TUI observability. A real ANALYZE worker ran for about 3m41s without the expected live subagent-style timeline. This is treated as a failed projection canary, not as a successful `EVENT_NATIVE` canary.

## 6.1.3 projection contract

6.1.3 aligns worker presentation with OpenCode's native Task mechanics:

1. `session.create({ parentID: <orchestrator session> })` establishes the native parent/child relationship.
2. The running ADE tool publishes `title` plus `metadata.sessionId`.
3. Child tool parts are projected through `metadata.summary` using Task-compatible `{id, tool, state}` rows.
4. ADE continues recording its noncanonical `observations.jsonl` independently of the UI.

`ade_doctor.observation.capture_mode=EVENT_NATIVE` means only that host events are being ingested. `delivery_mode=TASK_COMPAT_METADATA` identifies the projection path. `visibility=HOST_CANARY_REQUIRED` remains until a human verifies the TUI behavior on the target host.

## Target-host acceptance

After migration/restart:

1. Start a nontrivial analysis workflow and run it.
2. While the worker is active, verify that the parent UI exposes the ADE child/progress entry before completion.
3. Verify child tool activity/tool count updates while it runs.
4. Confirm `/ade-worker <job-id>` and `ade_worker_events` agree with the child session after completion.
5. Run `validate-opencode.py --model <provider/model> --behavioral` for the non-visual durable workflow checks.

If steps 2-3 still fail while `ade_worker_events` contains live events, report it as `HOST_UI_PROJECTION_UNSUPPORTED`, not as an event-capture failure.

## Perssua-TS engineering admission acceptance

The observed project policy is already human-authorized but has an empty check registry. After migration, `/ade-doctor` should report the standard verifier checks as auto-provisionable and `ready_for_standard_engineering=true` when local TypeScript and `src/` are present.

Starting the D6 engineering workflow with `tsc-noEmit`, `dist-build`, and `premium-grep-zero` must persist the workflow without asking the user to edit `checks:{}`. The first admission may update `.ai/execution-policy.json` with ADE safe presets. VERIFY must execute those policy-owned checks without separate per-check chat grants.

A nonfunctional `.git` directory that yields `not a git repository` must use filesystem evidence rather than blocking. Only a genuinely inconsistent Git topology remains a VCS precondition failure.
