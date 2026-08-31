# Validation - ADE 6.1.3

Run from the package root:

```powershell
py -B .\tooling\ade.py regression
py -B .\tooling\ade.py static-policy
Set-Location plugin
npm test
npm run typecheck
```

The 6.1.3 gates cover authorized-empty-policy auto-provisioning, aggregate admission diagnostics, policy-owned verifier execution without repetitive grants, current-state-vs-history guidance, canonical/noncanonical isolation, high- and low-level beta-18743 event projection, secret redaction, reasoning-payload suppression, live current-worker projection, eventless/degraded fallback, reattach plus persisted-worker adoption, parent-bound `/ade-worker`, Git-native BUILD evidence, Git-optional bounded filesystem evidence, filesystem BUILD recovery, and fail-closed inconsistent VCS admission.

On the target OpenCode host, run `validate-opencode.py` after restart. Host contract details are in `HOST_VALIDATION_ADE_6.1.3.md`.


## Real-host projection gate

A passing event-capture test is not a passing UI-observability test. The 6.1.3 acceptance gate additionally requires a target-host run to show the parent-linked worker/progress entry while the worker is still running. See `HOST_CANARY_FINDINGS_6.1.1.md` and `HOST_VALIDATION_ADE_6.1.3.md`.
