# Validation — ADE v5.2.7

## A. Source/static — determinística

Antes de empacotar:
- 43 grupos Python (inclui `provider-tool-choice-compat`, `windows-grant-test-parity`, `human-authorization-boundary`, `authorization-effect-binding` e `docs-integrity`);
- 85 testes Node (79 herdados + 6 provider-compat; base/human-auth/security-negative + grants A-L + exact-effect/TOCTOU M-AB);
- TypeScript `tsc --noEmit` (com `node-shim` corrigido para Windows);
- 18 agents / 28 typed tools;
- structured handoff ownership/schema/limits;
- lifecycle mock com handoff persistence e authority rejection;
- evidence/state hardening;
- state-driven routing;
- telemetry privacy + cost intelligence;
- bounded provider retry;
- installer/migrator/uninstaller safety;
- authorization boundary (`repo policy != mutation authority`; `ask` + explicit external grant; `--auto`/`always` não substituem grant).
- exact-effect authorization binding + TOCTOU guards (M-AB) e grant-store isolation/corruption fail-closed.

## B. Core runtime — bloqueante para operação

`validate --model` prova no host:
1. manifesto instalado;
2. plugin ativo;
3. provider baseline;
4. catálogo ADE aceito;
5. `orchestrator -> ade_status` executado realmente;
6. `experimental.subagent_depth=2` resolvido.

## C. Contract Assurance — determinística e obrigatória no validate

Sempre roda, com ou sem `--behavioral`:
- 28 tools instaladas;
- Orchestrator não recebe handoff-submit;
- 17 child/owner agents recebem `ade_handoff_submit`;
- agent instructions exigem exactly-one handoff + resposta curta;
- schema 4 KiB / 8 refs / 8 changed / recent=3;
- plugin contém authority enforcement, durable handoff log e telemetry privacy markers.

Marcadores:

```text
HANDOFF_CONTRACT_VALIDATED
EFFICIENCY_CONTRACT_VALIDATED
CONTRACT_ASSURANCE_VALIDATED
```

## D. Behavioral Canary — model-driven

`validate --model ... --behavioral` executa canaries no provider/model real. Não valida frases literais; valida comportamento observável:
- subagent correto;
- `ade_handoff_submit` chamado exatamente uma vez por child/owner esperado;
- status/required_owner/next corretos;
- ausência de tools extras proibidas;
- resposta abaixo do budget de texto.

Falha é real behavioral regression para aquela combinação host/provider/model.

## E. Release Assurance

```powershell
py -B .\tooling\ade.py assure --source --model "provider/model"
# ou legado:
py -B .\assure-opencode-v5.2.7.py --source --model "provider/model"
```

Com `--model`, behavioral canary é executado por padrão. Só então sai:

```text
RELEASE_ASSURANCE_VALIDATED: core + contract + behavioral canary
```

`--core-only` é diagnóstico; imprime `RELEASE_ASSURANCE_NOT_CLAIMED`.

## Delegation-driven behavioral reliability (v5.2.5)

Behavioral canaries remain strict. To measure provider/model consistency across repeated trials without relaxing any assertion:

```powershell
py -B tooling/ade.py behavioral-reliability --model "provider/model" --trials 5
```

Add `--strict` to return a failing exit code if any trial fails. A reliability report is diagnostic and does not replace `assurance --model`.

## Live integration matrix (v5.2.5)

`ade live-test` is the multi-model real-runtime layer above Core, Contract and the single-model Behavioral Canary. It reuses the strict behavioral functions; it does not relax individual assertions. Use `--strict` when every requested model and every trial must pass. See `LIVE_TESTING.md`.


## v5.2.7 hardened + compatibility checks

Contract Assurance verifies that Project Manager owns `ade_tracker_project_snapshot`/`ade_tracker_project_sync` com `ask` para sync, generic tracker mutation isolada em Tracker Operator com `ask`, VCS `stage/commit/push/pr_create` com `ask`, `project-check`/`diagnostic-check` com `ask` quando host process, runtime-generated handoffs com `post_state`, e provider retries com circuit breaker. `HUMAN_AUTHORIZATION_REQUIRED` é forçado via `ctx.permission.hook("evaluate")` mesmo se frontmatter divergir; repo `authorized=true` não substitui `ask`.

## v5.2.5 deterministic control-plane checks (retidos)

Contract Assurance verifies that Project Manager owns `ade_tracker_project_snapshot`/`ade_tracker_project_sync`, generic tracker mutation remains isolated to Tracker Operator, runtime-generated handoffs are present for deterministic operations, and provider retries use failure-signature circuit breaking.

Migration/install do not run Behavioral Assurance or Live Matrix. Use those explicitly after the runtime is healthy.

## Two-channel grant limitation (v5.2.7)

`ask` em `opencode --auto` é auto-aprovado (`AUTO_APPROVED`), então `ask` sozinho não prova humano. Por isso v5.2.7 exige **grant externo** (`/ade-authorize`) para mutações `HUMAN_REQUIRED`; sem grant → `ADE_HUMAN_AUTHORIZATION_REQUIRED` e ZERO external mutations mesmo com `ask` auto-aprovado ou `always allow`. Grants são single-use, 10min TTL, `resource_hash` exato e `project_hash` de `realpath`; consumo é atômico antes do side effect. `dry_run` não exige grant. Nunca registra `AUTO_APPROVED` como `human authorized`.


## Provider compatibility gate (v5.2.7)

Source/static validation exige `session.hook("http.request")`, scoped auto-only Zen model registry, `required/named → auto`, `none → tools omitted`, unknown-provider no-op, 2 MB body bound e testes Node contra o endpoint `/zen/v1/responses`. O gate Windows também exige que grant helper parity normalize `realpath` case-insensitively e que C/G/L usem `/ade-authorize` real.
