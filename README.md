# AI-Driven Engineering v5.2.6 Hardened — Human Authorization Boundary

ADE v5.2.6 Hardened keeps the v5.2 Product / Delivery / Engineering governance model, STATE_DRIVEN Orchestrator, lazy Skill, bounded context, structured handoffs and deterministic control plane, but enforces **repo policy != human authority** via OpenCode `ask` permissions for high-impact mutations.

The design rule is: **LLMs decide content; ADE decides mechanics.**

## Architecture

```text
canonical .ai state
        ↓
ade_route_snapshot
        ↓
Orchestrator chooses only the authority needed now
        ↓
owner/specialist reasoning when reasoning is required
        ↓
typed runtime operation / state transition
        ↓
runtime receipt + canonical handoff + post_state
        ↓
Orchestrator reads post-operation route_snapshot
        ↓
concise USER_BRIEF
```

### Deterministic GitHub Project path

For configured GitHub Projects V2, Project Manager no longer needs a Tracker Operator subagent in the normal path:

- `ade_tracker_project_snapshot` resolves the configured project, fields, single-select options, iterations and items.
- `ade_tracker_project_sync` applies a bounded batch, maps field/option/iteration IDs, performs GitHub GraphQL writes, reads the project back and verifies expected vs actual values.
- The sync returns `requested`, `updated`, `verified`, `failed`, verification details, a runtime-generated `canonical_handoff` and `post_state`.
- `tracker-operator` remains a fallback for providers/operations not covered by the deterministic adapter or genuine ambiguity.

GitHub Project writes remain gated by `.ai/tracker-policy.json`. Credentials are resolved from the authorized OpenCode integration and are not written to ADE files.

### Runtime-generated handoffs

`ade_handoff_submit` remains available for conclusions that exist only in agent reasoning. However, state transitions and deterministic tracker syncs now emit `origin=runtime` handoffs themselves. Agents must not duplicate those handoffs.

Product/Delivery/Engineering transition tools also return `post_state`, so acceptance cannot depend on a child agent's prose.

### Circuit breaker

Provider failures are normalized into stable signatures:

- deterministic `tool_choice` auto-only incompatibility: **0 retries**;
- identical `reasoning item expired`: at most **1 retry** per session/agent/provider/model/signature;
- repeated identical signature: circuit open / no retry.

Use `/ade-failures` to inspect recent signature/domain/retry decisions.

## Surface

- 18 agents.
- 28 typed ADE tools.
- Orchestrator remains minimal: `ade_status` + `ade_route_snapshot` only.
- Project Manager owns deterministic Project V2 snapshot/sync plus Delivery transition/validation.
- Tracker Operator keeps only generic tracker read/write + handoff fallback capabilities.
- Raw shell/execute remain hidden from ADE agents.

## Context/UX efficiency

- `opencode/autoinvoke: false` keeps the Skill lazy.
- Child agents use bounded generation budgets.
- `ade_state_get` is compact by default and evidence queries default to 5.
- User-facing Orchestrator responses target ~3–6 bullets / ~180 words.
- Telemetry stores metadata, not prompts or tool arguments.

## Validation layers

These responsibilities are intentionally separate:

1. **Install/Migrate** — managed files/config only; no behavioral matrix.
2. **Core Runtime** — plugin/provider/catalog/one real ADE tool/config.
3. **Contract Assurance** — deterministic capability/schema/state/security checks.
4. **Behavioral Assurance** — strict model-driven routing/recovery canaries.
5. **Live Matrix** — repeated multi-model reliability measurement in isolated temporary projects.

A Core/Contract PASS does not imply Behavioral PASS. A failed behavioral trial is not converted into success by a pass-rate threshold.

## Upgrade from v5.2.5 (validated)

```powershell
py -B .\tooling\ade.py migrate --target "$HOME\.config\opencode"
# ou shim legado:
py -B .\migrate-v4-to-v5.py --target "$HOME\.config\opencode"
opencode2 service restart
py -B .\tooling\ade.py validate --model "opencode/muse-spark-1.2-contributor-free"
```

Do **not** run a Live Matrix during installation. Return to normal work first. For model reliability:

```powershell
py -B .\tooling\ade.py behavioral-reliability --model "provider/model" --trials 5 --strict
py -B .\tooling\ade.py live-test --models "opencode/muse-spark-1.2-contributor-free" --trials 2
```

For complete release assurance:

```powershell
py -B .\tooling\ade.py assure --source --model "provider/model"
```

See `HARDENING.md`, `DETERMINISTIC_CONTROL_PLANE.md`, `STRUCTURED_HANDOFFS.md`, `DELEGATION_DRIVEN.md`, `LIVE_TESTING.md`, `VALIDATION.md` and `RELEASE_NOTES_v5.2.6.md`. `HUMAN_REQUIRED` é two-channel: `ask` em `--auto` vira `AUTO_APPROVED` e não basta; exige `grant` externo single-use via `/ade-authorize` fora de `.ai` com `resource_hash` exato, senão `ADE_HUMAN_AUTHORIZATION_REQUIRED` e ZERO external mutations.
