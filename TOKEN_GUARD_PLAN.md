# Determinus 3.0.2 — Token Guard Plan

## Evidence-based diagnosis

The inspected OpenCode session contained small durable records (about 182 KB
across 401 revisions), not a 200k-token Determinus database. Its usage report
instead showed repeated requests with roughly 226k new tokens and cache-bust
events. The prior plugin changed the leading system prompt on every context
hook and exempted the two most recent tool results from compaction. Both
behaviours make provider prompt-prefix caching ineffective and can replay a
large worker report immediately on the next request.

## Implemented controls

1. **Static cacheable system prefix:** the OpenCode 2 runtime no longer invokes
   the dynamic system-prompt transform during a session.
2. **Immediate tool-result containment:** every message, including the latest,
   is eligible for containment. The maximum retained tool/diff payload is
   1,200 characters; excerpts are 400 characters.
3. **Smaller tool responses:** the default Determinus tool response ceiling is
   1,200 characters. Test evidence is capped at 900 characters and only the
   latest eight records are retained.
4. **Evidence misuse prevention:** `determinus_run_test` accepts test, build,
   or validation commands only. File reads, git history, logs, and discovery
   must use normal read/grep/glob/bash tools and are not retained as test runs.
5. **Compact operating instructions:** the installed Determinus agent requires
   bounded evidence summaries and prohibits raw logs, source trees, generated
   output, and full diffs in chat.
6. **Clean plugin-only installation:** the installer stages the plugin, checks
   bundle hashes, installs runtime dependencies in the staged destination,
   verifies `@opencode-ai/plugin`, then atomically deploys. It does not patch,
   build, or require an OpenCode source checkout.

## Acceptance checks

- Typecheck and OpenCode 2 compatibility tests pass before release.
- The bundle manifest hashes validate before and after staging.
- After installation and an OpenCode restart, the plugin status is `active`.
- Run a fresh short Plan request. It must not report a cache bust caused by a
  changing Determinus system prompt, and its next turn must not replay large
  task/skill output.

## Important measurement rule

Start a **new session** after installation. A plugin cannot delete the already
stored 200k-token transcript from an existing OpenCode session. Project hygiene
such as removing generated `dist/` files from Git remains useful, but this
release fixes the Determinus-specific prompt and evidence amplification path.
