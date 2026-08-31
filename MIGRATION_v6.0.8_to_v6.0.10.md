# Migration ADE 6.0.8 → 6.0.10

ADE 6.0.10 supports a direct managed patch migration from 6.0.8; no intermediate 6.0.9 install is required.

```powershell
py -B .\migrate-opencode-v6.0.8-to-v6.0.10.py
```

Do not use `--force` for the normal path. The package installer remains hash-safe. Project `.ai/execution-policy.json` is reconciled later by the bounded SAFE_AUTO_REPAIR admission pass: missing policy is created unauthorized, legacy process-runner omissions are normalized, explicit denies remain denies, and malformed state fails closed.
