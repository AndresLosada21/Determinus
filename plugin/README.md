# ADE 6.1.3 OpenCode plugin

Native OpenCode V2 Promise plugin for the ADE durable engineering runtime. The kernel owns durable workflow state and creates disposable ANALYST/BUILDER/VERIFIER/REVIEWER sessions. For beta-18743, worker system context uses canonical `SystemPart`, prompt admission is not output evidence, and canonical assistant evidence must be settled via `time.completed`.


## Observation plane

ADE 6.1 correlates kernel-created worker sessions with `ctx.event.subscribe` and projects normalized activity through tool progress. `observations.jsonl` is a separate noncanonical timeline; canonical workflow authority remains in the hash-chained kernel journal. If the event stream is unavailable or stops delivering the active worker, ADE continues with `session.get` / `session.context` polling plus heartbeat (`POLLING_FALLBACK` / `EVENT_DEGRADED`).
