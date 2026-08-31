# Host Validation - ADE 6.1.0

- Host: OpenCode `0.0.0-beta-18743`, source `5894e4668872ecb071bd10ac01b32dfb7e93fb0c`.
- Isolated install and structural contract validation: pass.
- Strict behavioral matrix with `opencode/muse-spark-1.2-contributor-free`: `3/3` pass.
- Scenarios: durable analysis, approval boundary, worker lifecycle.
- Worker-stream contract: `ctx.event.subscribe()` provides the expected beta-18743 event shape; lifecycle updates use the active workflow tool's supported progress channel.
