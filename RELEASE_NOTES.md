# Determinus 3.0.1 — plugin-only deployment fix

This release runs exclusively as a plugin on the official OpenCode Beta. It does
not patch, compile, replace, or require the OpenCode source tree.

## 3.0.1 correction

- Installs `node_modules` in the staged deployed plugin, before activation.
- Verifies `@opencode-ai/plugin` is present in that deployed location.
- Writes the plugin path to OpenCode configuration with forward slashes on
  Windows, avoiding path-comparison false failures.

## Included fixes

- Native v2 tool-result prompt compaction at 8 KB with two-message recency.
- No legacy compaction-hook injection during every v2 request.
- Canonical Windows repository-root comparison for archive finalization.
- Deployment of only `determinus-*` command files and the canonical
  `determinus` agent.
- Clean isolation from all legacy Advance runtime state.
- Plugin-side token discipline: compact agent instructions, durable summaries,
  bounded evidence, and rejection of synthetic test evidence.

## Install

Run `install-opencode2.ps1` from the extracted root, then restart the official
OpenCode Beta and run `scripts/validate-opencode2-runtime.ps1`.

For the complete rationale, acceptance matrix, rollback, and operational
limits, see `docs/opencode2-conformity-plan.md`.
