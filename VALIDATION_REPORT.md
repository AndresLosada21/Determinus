# Validation report — ADE v5.2.6 Hardened

## Source gates

- Python regression groups: **41/41 PASS** before release sealing (inclui `human-authorization-boundary` + `authorization-effect-binding` + `docs-integrity`).
- Static Policy: **PASS**.
- Plugin Node tests: **79/79 PASS** (base/human-auth/security-negative + grants A-L + exact-effect/TOCTOU M-AB).
- TypeScript `tsc --noEmit`: **PASS** (Windows shim fix: `fileURLToPath`, `Buffer`, `node:os`).
- V2 plugin lifecycle mock: **PASS** for `Plugin.define` SDK and raw-default compatibility SDK.
- Security negative tests: **PASS** (25 cenários: self-auth, human approval, policy outside root, symlink, `.git/config`, secret outbound, staged secret, allowlists, duplicate/verification, JSONL corrupt, oversized, traversal, junction, minimal env, Docker defaults, circuit breaker, handoff revision, post_state, auto-approve).

## Deterministic control-plane coverage

- 18 agents / 28 typed tools.
- Project Manager direct GitHub Project V2 snapshot/sync capability: **PASS static + lifecycle mock**.
- Project field mapping and `updateProjectV2ItemFieldValue`: **PASS lifecycle mock**.
- Write → read-back → expected/actual verification: **PASS lifecycle mock**.
- Runtime-generated tracker handoff (`origin=runtime`): **PASS lifecycle mock**.
- Runtime-generated Engineering state-transition handoff + `post_state`: **PASS lifecycle mock**.
- Same-signature provider circuit breaker: **PASS lifecycle mock**.
- Tool-choice auto-only deterministic error gets zero retry: **PASS lifecycle mock**.
- `reasoning item expired` gets one retry then circuit open: **PASS lifecycle mock**.

## Managed lifecycle simulation

A clean managed v5.2.5 installation was created in a temporary target, then migrated directly to v5.2.6.

- v5.2.5 → v5.2.6: **PASS** (39/39 regression, 51/51 Node, TypeScript PASS).
- Installed manifest: schema 7 / package 5.2.6 / 18 agents / 28 tools: **PASS**.
- Contract Assurance after migration: **PASS** (human-auth boundary validated).
- v5.2.6 uninstall → v5.2.5: **PASS** (byte-identical `orchestrator.md` restored).
- `preserved_modified=0`: **PASS**.
- ZIP integrity + secret scan + no hardcoded personal paths: **PASS**.

## Deliberately pending

This build environment cannot call the user's real Windows OpenCode/Zen runtime. Therefore:

- OpenCode `0.0.0-beta-18684` Windows runtime revalidation: **PENDING**.
- Provider/model Behavioral Assurance: **PENDING BY DESIGN**.
- Real GitHub Project write against the user's Project 4: **PENDING**.

These pending items do not invalidate source/lifecycle validation, but they are not represented as completed evidence.
