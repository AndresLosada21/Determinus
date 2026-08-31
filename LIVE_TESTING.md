# ADE Live Integration Testing

The v5.2.5 live runner turns a real OpenCode V2 installation into an isolated integration-test runner for ADE. It never points behavioral canaries at the current repository: every scenario creates its own temporary project containing only a synthetic `.ai/control.json`.

## Default OpenCode Zen free matrix

The curated defaults were checked against the OpenCode Zen catalog on 2026-08-30:

- `opencode/muse-spark-1.2-contributor-free`
- `opencode/mimo-v2.5-free`
- `opencode/ling-3.0-flash-fin-free`
- `opencode/nemotron-3-ultra-free`
- `opencode/nemotron-3.5-lightning-free`

Zen free-model availability is temporary and may change. The runner therefore probes the local `opencode2 models` catalog and performs a real provider/plugin probe before running behavioral trials. Catalog visibility is informative; the real runtime probe is authoritative.

References:

- https://opencode.ai/v2/docs
- https://opencode.ai/v2/docs/cli
- https://opencode.ai/v2/docs/models
- https://opencode.ai/docs/zen/

## Run the complete matrix

PowerShell:

```powershell
.\live-test-opencode.ps1 --trials 3
```

Python:

```powershell
py -B .\live-test-opencode.py --trials 3
```

Run a smaller matrix:

```powershell
py -B .\live-test-opencode.py `
  --models "opencode/muse-spark-1.2-contributor-free" "opencode/mimo-v2.5-free" `
  --trials 5
```

Require every requested model probe and every strict trial to pass:

```powershell
py -B .\live-test-opencode.py --trials 5 --strict
```

## Scenarios

The runner reuses the exact behavioral assertions used by ADE assurance:

1. `nested-delegation`: Orchestrator -> Project Manager -> Tracker Operator with structured handoffs and no state/evidence rehydration by the child chain.
2. `capability-recovery`: Explorer and Implementer classify an already-observed capability denial without retrying the denied action or giving the user a manual bypass.
3. `engineering-recovery`: Engineer delegates independent validation exactly once to Verifier and consumes the typed handoff.

A reliability percentage does not weaken any scenario. Each individual trial is either strict PASS or strict FAIL.

## Output

By default the runner creates:

```text
ade-live-results/<UTC timestamp>/
  report.json
  report.md
  catalog.txt
  logs/
    core-contract.log
    <model>/probe.log
    <model>/<scenario>-trial-XX.log

ade-live-results/<UTC timestamp>-evidence.zip
```

The report includes per-model probe status, scenario pass counts, mean latency and normalized failure domains. Logs are redacted for common API/token patterns before being persisted.

## Failure domains

The runner distinguishes at least:

- `AGENT_BEHAVIOR`
- `PROVIDER_OR_OPENCODE_RUNTIME`
- `MODEL_UNAVAILABLE`
- `ADE_RUNTIME`
- `UNKNOWN`

This is diagnostic classification, not proof of root cause. In particular, `tool_choice`, `reasoning item expired` and failed subagent executions are classified conservatively as provider/OpenCode-runtime until stronger evidence exists.

## Safety boundary

The live runner does **not** synchronize a real tracker, modify GitHub Projects, run project checks from the current repository, commit, push, or invoke VCS mutation tools. It tests the ADE contracts using synthetic temporary projects. Remote CRUD integration should have a separate adapter test suite with dedicated fixtures/test resources.


## v5.2.5 operational rule

The Live Matrix is **not** part of installation or migration. Use one trial for a quick provider check; multi-trial matrices are pre-release/diagnostic work and can be slow on free models. Deterministic tracker synchronization is tested separately from LLM routing because remote CRUD should not depend on model compliance.
