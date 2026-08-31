# Hardening — ADE 6.0.1

ADE 6 preserves v5 security hardening and adds durable-runtime invariants.

## Durable control-plane hardening

- Canonical state is outside the repository.
- Event journal is append-only, locked, bounded and SHA-256 hash chained.
- Snapshot is derived and never trusted over the journal.
- Unsafe/symlinked external state roots are rejected.
- Corruption produces `SAFE_READ_ONLY`.
- Workers cannot access kernel/grant stores or create subagents.
- Builder mutation is serialized per project and starts only from a clean non-`.ai` baseline.
- Worker leases and bounded attempts prevent indefinite zombie work.
- Reconciliation interrupts expired sessions when possible before retry/block decisions.
- Deterministic check progress is persisted incrementally across approval waits.

## Exact-effect authorization

Repository policy defines bounds but cannot self-authorize. High-impact tracker/VCS/project-check activities require short-lived, single-use external grants bound to the exact resolved effect. Relevant state is revalidated immediately before the side effect. Saved `allow` or `--auto` never replaces the external grant.

## Filesystem / secrets / processes

The prior hardened realpath, symlink/reparse, sensitive-resource, output redaction, outbound-secret, staged-secret, minimal-environment and bounded JSON/JSONL guards remain. Host process checks require explicit policy; generic shell interpreters are blocked. Docker defaults to no network, read-only rootfs, capability drop, no-new-privileges and bounded resources unless policy explicitly grants more.

## VCS and remote operations

Commit hooks/signing are preserved by default, force-push surfaces are absent, push targets are allowlisted and read back, tracker writes are preflighted and read back, HTTP redirects are rejected for protected remote clients, and credentials come from authorized integration resolution rather than project content.

## Scoped OpenAI Codex wire compatibility (6.0.1)
Provider compatibility is fail-minimal: the native request hook removes only `max_output_tokens` on `chatgpt.com/backend-api/codex/responses`. It does not disable generation budgets globally and leaves public OpenAI API requests untouched. The compatibility path does not log prompts, authorization headers or request bodies.
