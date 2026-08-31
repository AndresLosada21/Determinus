# ADE 6.0.11

AI-Driven Engineering for OpenCode. ADE uses a durable, hash-chained kernel for workflow state and treats LLM sessions as disposable workers.

## Runtime model

- Select `orchestrator` in OpenCode. It submits and advances durable workflows.
- `explorer`, `implementer`, `verifier`, and `reviewer` are kernel-managed workers and are intentionally hidden from the agent picker.
- Engineering completion requires configured deterministic checks.
- High-impact effects require an exact-effect `/ade-authorize` grant.
- Invalid or ambiguous project state fails closed.

## Install or upgrade

```powershell
py -B .\install-opencode.py
# Existing ADE installation
py -B .\migrate-to-v6.0.11.py
opencode2 service restart
py -B .\validate-opencode.py
```

The installer preserves user-owned configuration. It registers ADE agents through the canonical OpenCode `agents` map and validates the runtime catalog.

## Validation

Run the deterministic gates from a clean checkout:

```powershell
py -B .\tooling\ade.py regression
py -B .\tooling\ade.py static-policy
Set-Location plugin
npm test
npx tsc -p tsconfig.json --noEmit
```

See `COMPATIBILITY.md`, `HARDENING.md`, `DURABLE_KERNEL.md`, and `HOST_VALIDATION_ADE_6.0.11.md` for the current contract and validation evidence.
