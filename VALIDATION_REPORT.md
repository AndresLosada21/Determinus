# Validation report — build v5.2.0

Executed in the packaging environment:

- TypeScript: `tsc -p plugin/tsconfig.json --noEmit` — PASS.
- Node plugin tests: 24/24 — PASS.
- Python regression: groups 1–31/32 — PASS before final source hash; group 32 is the release-integrity hash gate and is rerun after `RELEASE.json` is finalized.
- Installer simulation in a clean temporary target — PASS:
  - removed legacy top-level `subagent_depth`;
  - preserved unrelated `experimental.keep_me`;
  - wrote `experimental.subagent_depth=2`;
  - set `default_agent=orchestrator`;
  - installed 18 agents / 25 tools / manifest schema 7;
  - installed `manifest-check` passed.
- Lifecycle regression includes malformed legacy `evidence: {}` and verifies normalization + durable evidence log — PASS.

Not executable from this Linux packaging environment:
- real `opencode2 beta-18684` Windows runtime;
- Windows PowerShell test suite;
- model-driven behavioral evals.

Those remain explicit post-install gates and are not represented as validated here.
