# Migration — ADE 6.0.8 to 6.0.9

```powershell
py -B .\migrate-v6.0.8-to-v6.0.9.py
opencode2 service restart
py -B .\validate-opencode.py
```

The migration is managed and hash-safe; do not use `--force` unless a later explicit recovery procedure requires it. ADE 6.0.9 preserves the 6.0.8 engineering-policy preflight and adds stricter OpenCode beta-18721 worker evidence contracts: canonical settled assistants, complete Promise prompt typing, deterministic worker failure domains, and permanent regression coverage for INC-BETA18721-WORKER-ZERO-TOKEN. Project-local `.ai/*` configuration is not rewritten by this migration.
