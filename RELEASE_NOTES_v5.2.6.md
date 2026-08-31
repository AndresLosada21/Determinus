# ADE v5.2.6 Hardened — Human Authorization Boundary

## Objetivo

Separar definitivamente **project policy** (dado não confiável, define limites máximos) de **human authority** (capability grant fora do repositório). Fechar a lacuna onde `ask` em `opencode --auto` é auto-aprovado e mutações sensíveis executariam sem humano real.

## Mudanças

- **Two-channel authorization**: `ade_tracker_project_sync` (PM), `ade_tracker_write` (Tracker), `ade_vcs_stage/commit/push/pr_create` (VCS), `ade_project_check` (Verifier), `ade_diagnostic_check` (Debugger) exigem **simultaneamente**: (1) project policy `authorized=true`, (2) deterministic guards, (3) permission não `deny`, (4) grant externo single-use `ade-grants/<project_hash>.jsonl` fora de `.ai`, (5) não expirado, (6) fingerprint `resource_hash` exato, (7) consumo atômico antes do side effect, (8) sem replay. Sem grant → `ADE_HUMAN_AUTHORIZATION_REQUIRED` e ZERO external mutations (verificado por contador fetch/spawn/git).
- **Exact-effect binding**: grant é preso ao efeito resolvido (target/config + payload integral digest + VCS/check state). Toda operação revalida antes do side effect; stale → `ADE_AUTHORIZATION_STALE`. Push usa o SHA autorizado explícito.
- **Grant-store isolation**: store fora de `.ai`, leitura/escrita negadas a agents, corrupção/oversize fail-closed; provenance=`EXPLICIT_EXTERNAL_GRANT`.
- `ask` permanece como UX (plugin força `ask` para high-impact), mas não é considerado `USER_APPROVED` em `--auto` (vira `AUTO_APPROVED`/`AUTO_UNTRUSTED`). Grant é a capability fail-closed; provenance=`EXPLICIT_EXTERNAL_GRANT`.
- Novo comando externo explícito `/ade-authorize <tool> <json-input>` cria grant 10min TTL, `max_uses=1`, `project_hash=sha256(realpath)`, `resource_hash=sha256(canonical(exact_effect))`, armazenado em `$XDG_STATE_HOME/opencode/ade-grants` (fallback `~/.local/state/...`; `%LOCALAPPDATA%\opencode\ade-grants` no Windows) com `withFileLock` e `fsync`. Grants dentro de `.ai` são ignorados; `always allow` não substitui grant; alias de path não reutiliza grant de outro root.
- `plugin/src/index.ts` adiciona `grantsRootDir`, `canonicalStringify`, `hashResource`, `projectHashForRoot`, `createHumanGrant`, `consumeHumanGrant`, `resourceFingerprintFor` e comando `ade-authorize` com telemetry `human.grant.create/consume/missing`.
- `tooling/ade_tooling/policy.py`/`regression.py` ganham `human-authorization-boundary` (verifica `ask` + grant) e `docs-integrity` (detecta headings duplicados/concatenados).
- Preserva todo hardening RC1: realpath, symlink/reparse, atomic+fsync, bounded JSON/JSONL, `LOG_CORRUPT`, secrets redaction/outbound, GitHub sync preflight→read-back→verify→receipt, VCS hooks, env mínimo, Docker `network=none` etc.

## Validação

- Python regression: 41/41 PASS (inclui `human-authorization-boundary` + `authorization-effect-binding` + `docs-integrity`)
- Static Policy: PASS
- Node plugin tests: 79/79 PASS (base/human-auth/security-negative + grants A-L + exact-effect/TOCTOU M-AB)
- TypeScript `tsc --noEmit`: PASS (Windows shim corrigido)
- Human grant functional A-L: PASS; exact-effect/TOCTOU M-AB: PASS (full-body hashing, remote/config binding, staged/HEAD binding, check-definition binding, grant-store isolation/corruption, store fora do project root/sem parent symlink, order-stable canonicalization)
- v5.2.5 → v5.2.6 migration: PASS
- v5.2.6 → v5.2.5 rollback: PASS (byte-identical)
- ZIP integrity, secret scan, hardcoded paths, docs duplication: PASS

## Instalação

Fast path preserved: `validate → backup → install/migrate → manifest → rollback → finish`. Behavioral/live não rodam no install. Após restart: `tooling/ade.py validate --model <provider/model>` (Core+Contract) e `assure --source --model` (inclui behavioral canary) ou `live-test` explícito.

## Limitações

Ver `HARDENING.md` — `USER_APPROVED` vs `AUTO_APPROVED` ainda não distinguível confiavelmente na API V2; comportamento é fail-closed e documentado.
