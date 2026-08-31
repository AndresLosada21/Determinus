# ADE 6.0.1 — Durable Engineering Runtime

ADE 6 replaces agent-to-agent orchestration with a durable local workflow kernel. OpenCode remains the session/model executor; the ADE kernel owns workflow state, scheduling, retries, worker lifecycle, authorization boundaries, reconciliation and canonical completion.

## Core rule

**The runtime coordinates. LLMs are disposable workers.**

- No active worker can create another worker.
- No LLM writes canonical workflow state directly.
- Engineering `DONE` requires deterministic project checks.
- External mutations remain behind exact-effect, single-use external grants.
- Canonical workflow state lives outside the repository in a hash-chained event journal.
- A derived snapshot can be deleted and rebuilt from the journal.
- Journal corruption puts the kernel into `SAFE_READ_ONLY`.
- Running jobs use leases; expired leases are reconciled after interruption/restart.

## Active runtime roles

ADE 6 has 5 active OpenCode agents:

| Agent | Kernel role | Mutation authority |
|---|---|---|
| `orchestrator` | conversation gateway | none |
| `explorer` | Analyst worker | read-only |
| `implementer` | Builder worker | workspace edit only |
| `verifier` | Verifier worker | read-only; deterministic checks are kernel activities |
| `reviewer` | Reviewer worker | read-only |

The 13 v5 organizational agents remain installed as explicit `disabled: true` tombstones so a managed v6 uninstall can restore the previous release byte-for-byte. They have no v6 capability surface.

## Durable workflow kinds

- `analysis`: Analyst → Reviewer → `DONE`.
- `engineering`: Analyst → Builder → Verifier + deterministic checks → Reviewer → `DONE`.
- `implementation_proposal`: Analyst → Builder → Reviewer → `RESULT_PROPOSED`; never silently promoted to verified completion.
- `tracker_sync`: deterministic tracker activity with exact-effect approval and remote read-back verification.

The gateway uses `ade_workflow_start`, then `ade_workflow_run`. The kernel alone creates worker sessions via OpenCode `session.create → switchAgent → prompt → wait → context`.

## Durable state

Windows:

```text
%LOCALAPPDATA%\opencode\ade-kernel\<project_hash>\
  events.jsonl
  snapshot.json
  *.lock
```

Unix:

```text
$XDG_STATE_HOME/opencode/ade-kernel/<project_hash>/
```

`events.jsonl` is canonical. Every event contains a monotonic sequence, `prev_hash` and `event_hash`. The snapshot is only a cache.

Legacy `.ai/control.json` is not canonical in v6. If present on first use, a compact legacy state is imported as a non-authoritative event so history is not silently lost.

## Approval model

Repository policy defines the maximum permitted scope but cannot authorize itself. High-impact deterministic activities require an external `/ade-authorize` grant that is:

- outside the repository;
- exact-effect scoped;
- project-realpath scoped;
- short-lived;
- single-use;
- atomically consumed before the side effect;
- revalidated immediately before the side effect.

`--auto` or saved OpenCode `allow` does not replace that grant.

## Upgrade 6.0.0 → 6.0.1

If ADE 6.0.0 is already installed, use the managed patch migration:

```powershell
py -B .\migrate-v6.0.0-to-v6.0.1.py
opencode2 service restart
py -B .\validate-opencode.py --model "opencode/muse-spark-1.2-contributor-free"
```

6.0.1 fixes the ChatGPT/Codex OpenAI HTTP 400 caused by the host lowering ADE generation budgets into `max_output_tokens` on the private Codex responses route. It also makes workflow creation explicit: `ade_workflow_start` persists the DAG and returns `WORKFLOW_STARTED`; `/ade-workflow` shows what is active and what runs next.

## Install / replace v5.2.8

From the release bundle:

```powershell
py -B .\migrate-opencode-v5.2.8-to-v6.0.1.py
opencode2 service restart
py -B .\validate-opencode-v6.0.1.py --model "opencode/muse-spark-1.2-contributor-free"
```

The migration is transactional. Uninstalling v6 restores the managed prior ADE installation from the installer backup. Project-local `.ai/*` files are preserved; v6 simply stops treating legacy state as canonical.

## Verification philosophy

Worker prose is a proposal, not evidence of reality. Engineering completion requires deterministic checks configured in `.ai/execution-policy.json`. If several checks need approval, completed check results are journaled individually; a later `WAITING_APPROVAL` resume does not rerun the Verifier worker or consume a previous grant again.

## Validation surfaces

- Python source regression + static policy.
- Node functional/plugin tests.
- TypeScript typecheck.
- install/migrate/uninstall lifecycle.
- extracted-ZIP rerun.
- optional provider/runtime core validation.
- optional live behavioral matrix.

See `DURABLE_KERNEL.md`, `HARDENING.md`, `VALIDATION.md` and `MIGRATION_v5.2.8_to_v6.0.1.md`.
