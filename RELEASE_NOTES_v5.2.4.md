# ADE v5.2.4 — Live Integration Matrix

v5.2.4 adds a reproducible real-runtime test harness around the strict v5.2.3 behavioral contracts. No behavioral assertion was relaxed.

## Added

- `live-test-opencode.py` / `.ps1` multi-model runner.
- Default matrix for current OpenCode Zen free models.
- Real model/plugin probe before behavioral trials.
- Per-model/per-scenario repeated strict trials.
- JSON + Markdown reports and zipped evidence bundle.
- Failure-domain classification for agent behavior, provider/OpenCode runtime, unavailable models and ADE runtime.
- Bounded redaction for common authorization/API-token patterns in persisted logs.
- Explicit isolation guarantee: canaries run only in generated temporary projects.

## Validation model

`validate` remains Core + Contract. `assure --model` remains the single-model strict release gate. `live-test` is an integration/reliability matrix across multiple real models and does not convert failures into successes.

## Why

Real project use showed that a provider/model may pass deterministic ADE contracts while still producing flaky subagent execution or unnecessary child behavior. v5.2.4 makes that behavior measurable before a model is recommended for a specific ADE role.
