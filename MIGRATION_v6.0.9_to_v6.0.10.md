# Migration ADE 6.0.9 → 6.0.10

Run the managed migrator without `--force`:

```powershell
py -B .\migrate-opencode-v6.0.9-to-v6.0.10.py
```

The package migration preserves user-owned configuration under the existing hash-safe installer rules. On first engineering admission in each project, 6.0.10 may perform bounded SAFE_AUTO_REPAIR of `.ai/execution-policy.json`. It never auto-authorizes the policy or reverses explicit deny values.
