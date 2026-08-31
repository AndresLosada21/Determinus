# ADE 6.0.8 - Engineering Policy Preflight

ADE v6 patch release focused on fail-fast engineering workflow admission.

Target: OpenCode V2 `0.0.0-beta-18721` (source commit `90fb6562ce09782c311040ba39a9d50edec6ad0e`).

## Host evidence carried forward

ADE 6.0.7 validated the worker runtime fix on the real beta-18721 host: analysis workers and reviewer produced assistant messages, non-zero token usage, `outcome=succeeded`, and no `ADE_KERNEL_WORKER_EXECUTION_FAILED` / `ADE_KERNEL_WORKER_INVALID_OUTPUT` failures.

The remaining engineering host block was project configuration: `.ai/execution-policy.json` was absent. ANALYZE and BUILD had already run before VERIFY discovered that deterministic project checks could not be resolved.

## Fix

ADE 6.0.8 adds a read-only engineering preflight before the durable DAG is created. For `kind=engineering`, the gateway now checks that:

- `.ai/execution-policy.json` exists;
- the policy has been explicitly human-authorized;
- every requested `check_name` is registered;
- each requested check is verifier-owned and `non_destructive=true`.

If any prerequisite is missing, `ade_workflow_start` returns `BLOCKED` with `ADE_WORKFLOW_PROJECT_POLICY_REQUIRED` before creating a workflow or worker session. No ANALYZE/BUILD/VERIFY model tokens are spent on a workflow that cannot possibly pass deterministic verification.

## Security boundary retained

This patch does **not** auto-authorize a policy, invent project checks, or bypass ADE's external grant model. `/ade-init` still creates the project policy with `authorized:false`; project checks remain human-reviewed project configuration. OpenCode's own permission model remains a separate host boundary.

## Validation boundary

Source, Node, Python, TypeScript, static-policy, migration and bundle-integrity gates are deterministic. The 6.0.8 host validation should verify both paths:

1. missing/unauthorized policy fails immediately with zero worker sessions;
2. after explicit project policy setup, an engineering workflow can reach ANALYZE → BUILD → VERIFY → REVIEW.
