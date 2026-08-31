# Migration - ADE 6.0.7 to 6.0.8

```powershell
py -B .\migrate-v6.0.7-to-v6.0.8.py
opencode2 service restart
py -B .\validate-opencode.py
```

ADE 6.0.8 preserves the 6.0.7 beta-18721 worker fix and adds fail-fast engineering policy preflight. It does not modify project-local `.ai/execution-policy.json` during plugin migration.

Before starting an engineering workflow, initialize/review the project policy explicitly if needed. `/ade-init` creates missing ADE project templates with the execution policy disabled by default; register deterministic checks with the administrative project-check helper and authorize the policy only after review.
