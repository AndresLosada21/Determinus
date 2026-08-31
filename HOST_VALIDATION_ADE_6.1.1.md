# Host Validation - ADE 6.1.1

## Pinned host contract

- Product: OpenCode 2 beta
- Version: `0.0.0-beta-18743`
- Source repository: `anomalyco/opencode`
- Source commit: `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`
- Relevant Promise APIs: `session.create`, `session.get`, `session.prompt`, `session.wait`, `session.context`, and `event.subscribe`.

`event.subscribe` is feature-detected. Native mode is `EVENT_NATIVE`; loss/absence of the stream becomes `EVENT_DEGRADED` / `POLLING_FALLBACK` without failing the worker.

## Evidence used in the consolidation

The separately supplied agent-produced ADE 6.1.0 package reports a beta-18743 behavioral matrix of `3/3` and specifically exercises low-level `session.text.delta`, `session.tool.*`, and execution events. Those event aliases were incorporated into 6.1.1 after source/test review.

That external canary claim was **not independently rerun inside this build container**, so the 6.1.1 release does not relabel it as a locally executed host canary. The local suite validates the adapter behavior with beta-shaped events and the full durable runtime contract.

## Target-host canary

After installation/restart on the actual OpenCode host, run `validate-opencode.py`. This is the authoritative final host-level check for the packaged release.
