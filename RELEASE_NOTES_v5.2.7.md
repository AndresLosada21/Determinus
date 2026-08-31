# ADE v5.2.7 — Windows + Zen Compatibility Hardening

## Purpose

v5.2.7 is a compatibility/hardening release triggered by real Windows/OpenCode beta-18707 evidence from v5.2.6. Core+Contract were healthy, but Windows grant success fixtures produced 73/79 and Zen free subagents failed upstream on non-`auto` `tool_choice`.

## Fixes

1. Windows grant identity parity now matches production case-insensitive `realpath` hashing. Positive grant tests use `/ade-authorize` itself.
2. A narrowly scoped `http.request` shim normalizes only known OpenCode Zen free auto-only models: `required`/named → `auto`; `none` → removes tools; unknown providers/models unchanged.
3. Direct managed migration from v5.2.6.

## Security invariants retained

Exact-effect external grants, one-use/TTL, grant-store isolation, TOCTOU checks, secret outbound blocking, deterministic GitHub Project read/write/read-back, VCS exact-SHA push, process/Docker isolation and circuit breaker remain unchanged.

## Release state

`SOURCE_HARDENED_VALIDATED_RUNTIME_PENDING`: source/lifecycle gates are release-blocking; real OpenCode/Zen/GitHub revalidation remains explicit after restart.
