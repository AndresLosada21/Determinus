# ADE 6.0.1 OpenCode plugin

The plugin implements the Durable Engineering Runtime. The kernel owns workflow/event state, worker scheduling, leases/reconciliation and deterministic activities. Active OpenCode roles are Orchestrator gateway, Analyst (`explorer`), Builder (`implementer`), Verifier and Reviewer. Legacy v5 roles are disabled tombstones.

Canonical state is an external hash-chained journal. Raw subagent recursion and direct high-impact mutation capabilities are not exposed to active agents.
