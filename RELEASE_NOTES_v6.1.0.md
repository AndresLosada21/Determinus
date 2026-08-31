# ADE 6.1.0 - Observable Git-Optional Kernel

## Fixed

- BUILD no longer runs a raw Git status command as an admission requirement.
- Projects without an active Git branch run in filesystem mode; Git remains required for stage, commit, push, and pull-request effects.
- Native VCS status is classified explicitly; inconsistent VCS responses block before a builder worker is created.

## Observability

- Worker lifecycle and redacted live text, reasoning, and tool events are mirrored through the initiating workflow tool's progress channel.
- `/ade-worker <job-id>` returns the redacted completed output for a worker owned by the current parent session.
- Live event streaming is advisory. The durable journal stores bounded job lifecycle summaries, not unbounded streaming content.

## Compatibility

- Validated contract target: OpenCode `0.0.0-beta-18743`, source `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.
