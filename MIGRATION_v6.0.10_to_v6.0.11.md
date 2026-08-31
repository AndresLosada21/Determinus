# Migration ADE 6.0.10 to 6.0.11

ADE 6.0.11 is a direct managed patch migration from 6.0.10.

```powershell
py -B .\migrate-opencode-v6.0.10-to-v6.0.11.py
```

Do not use `--force` in the normal path. The installer merges the canonical OpenCode `agents` map with ADE's 18 managed definitions, preserves non-ADE agent entries, preserves an explicit user-owned collision by failing closed, and records managed definition hashes for idempotent reconciliation. Restart OpenCode and verify the canonical `/api/agent` catalog before starting a workflow.
