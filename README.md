# ADE 6.1.3

AI-Driven Engineering for OpenCode. ADE uses a durable hash-chained kernel for canonical workflow state and treats LLM sessions as disposable workers, with a separate live Observation Plane.

## Runtime model

- `orchestrator` submits and advances durable workflows; it never creates workers directly.
- `explorer`, `implementer`, `verifier`, and `reviewer` are hidden kernel-managed workers.
- `ade_workflow_run` creates parent-linked workers and projects Task-compatible child metadata (`sessionId` + tool summary) while retaining a sanitized Observation Plane. Target-host TUI visibility is a separate canary gate.
- `ade_worker_events` provides the bounded noncanonical observation timeline; `/ade-worker <job-id>` inspects a completed worker safely.
- Engineering admission auto-provisions the bounded safe presets `tsc-noEmit`, `dist-build`, and `premium-grep-zero` when the human-owned policy is already authorized; routine verifier checks then run under that policy without repetitive chat grants. Exact-effect grants remain mandatory for standalone/external mutation effects (push, PR, tracker writes, etc.).
- Git is preferred but not mandatory: a valid repository uses Git evidence, while a genuinely non-Git project uses bounded filesystem baseline/diff evidence. Inconsistent VCS fails closed.

## Install or upgrade

```powershell
py -B .\install-opencode.py
# Existing ADE installation
py -B .\migrate-to-v6.1.3.py
opencode2 service restart
py -B .\validate-opencode.py
```

Supported migration sources include v4/v5, ADE 6.0.x through 6.0.11, ADE 6.1.0, ADE 6.1.1, and ADE 6.1.2.

## Validation

```powershell
py -B .\tooling\ade.py regression
py -B .\tooling\ade.py static-policy
Set-Location plugin
npm test
npm run typecheck
```

See `COMPARISON_6.1.0.md`, `DURABLE_KERNEL.md`, `COMPATIBILITY.md`, `HARDENING.md`, `HOST_VALIDATION_ADE_6.1.3.md`, and `RELEASE_NOTES_v6.1.3.md`.
