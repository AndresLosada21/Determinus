# Validation — ADE 6.0.1

The release uses separate deterministic and live-runtime gates.

## Deterministic source gates

- Python regression groups covering package integrity, active worker model, durable kernel/event journal, scheduler, state machine, leases/reconciliation, verification resume, authorization, provider compatibility and security hardening.
- Static Policy.
- Node plugin functional tests.
- TypeScript typecheck.
- transactional install/migrate/uninstall lifecycle.
- extracted ZIP rerun.

## Runtime core gate

`validate` checks installed manifest, plugin activation/catalog, one real `ade_status` tool call when a model is supplied, v6 config (`subagent_depth=1`), durable-kernel contract and active surface (5 active agents / 34 tools).

Behavioral/provider canaries are opt-in and never run as part of install/migrate.

## Major migration gate

The tested release path is managed v5.2.8 → v6.0.1 → uninstall/restore v5.2.8, including byte-identical restoration of representative managed files.

## 6.0.1 compatibility gates
The provider test suite contains paired functional cases: ChatGPT/Codex Responses must omit `max_output_tokens`, while public OpenAI Responses must preserve it. Workflow tests require `WORKFLOW_STARTED`, `workflow_id` and `next_action`, plus the `/ade-workflow` command surface. Real Windows/OpenCode/OpenAI-Codex validation remains a host gate after installation.
