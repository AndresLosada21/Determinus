# Real-host canary findings - ADE 6.1.1

Target host: OpenCode2 `0.0.0-beta-18743`.

Observed on 2026-08-31 after installing ADE 6.1.1:

- Plugin load: PASS (`ai-driven-engineering.native v6.1.1`).
- Host baseline match: PASS.
- Durable kernel health: PASS.
- Event API capture mode: reported `EVENT_NATIVE`.
- Durable ANALYZE/REVIEW execution: PASS.
- Parent-visible live worker timeline: FAIL / not demonstrated.

A real ANALYZE worker ran from approximately `21:38:58Z` until `21:42:39Z` (~3m41s), but the user did not receive the expected live subagent-style timeline; completion appeared only at the end. Therefore the 6.1.1 diagnostic conflated event ingestion with UI delivery.

Root cause used for 6.1.2 design: OpenCode's native Task path creates child sessions with a parent relationship and publishes running tool metadata containing the child `sessionId` and a tool `summary`. ADE 6.1.1 created an independent worker session and sent ADE-specific progress metadata, which was valid API usage but not equivalent to the native Task presentation contract.
