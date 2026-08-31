---
name: ai-driven-engineering
description: Reference documentation for ADE 6 Durable Engineering Runtime. Runtime operation does not require loading this skill.
opencode/autoinvoke: "false"
compatibility: OpenCode V2 Promise plugin API; ADE kernel owns worker sessions and does not depend on native subagent nesting.
---

# ADE 6 Durable Engineering Runtime

This skill is reference-only. Do not load it automatically during normal workflows.

## Runtime model

The kernel owns workflow state, scheduling, retries, leases, reconciliation and deterministic activities. The active LLM roles are Orchestrator gateway, Analyst, Builder, Verifier and Reviewer. Workers do not delegate.

Canonical state is the external hash-chained event journal. `.ai/control.json` is legacy/non-authoritative in v6.

## Normal path

1. `ade_workflow_start` with an explicit workflow kind.
2. `ade_workflow_run` to execute ready jobs synchronously.
3. If `WAITING_APPROVAL`, the user issues the exact `/ade-authorize` command surfaced by the kernel.
4. Resume the same workflow; do not create a replacement workflow.
5. Observe final state with `ade_workflow_snapshot`.

For engineering workflows, deterministic project checks are mandatory and are executed by kernel activities after the Verifier worker proposal.

## Failure handling

Use `ade_kernel_reconcile` for expired worker leases. Do not manually retry external mutations, invoke raw shell or create nested subagents. A corrupt event journal is `SAFE_READ_ONLY` and must be diagnosed rather than reconstructed from agent text.
