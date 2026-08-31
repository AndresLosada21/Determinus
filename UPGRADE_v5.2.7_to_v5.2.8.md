# Upgrade v5.2.7 → v5.2.8

Use the managed migration path; do not `--force` a healthy v5.2.7 installation.

```powershell
py -B .\migrate-opencode-v5.2.7-to-v5.2.8.py
opencode2 service restart
py -B .\validate-opencode-v5.2.8.py --model "opencode/muse-spark-1.2-contributor-free"
```

Install/migrate does not run behavioral reliability or the live matrix. After Core + Contract are healthy, rerun the real delegated workflow.

Rollback is managed by the v5.2.8 uninstall manifest and restores the prior v5.2.7 managed files.
