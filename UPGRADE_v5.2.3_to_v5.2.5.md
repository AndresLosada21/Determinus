# Upgrade ADE v5.2.3 → v5.2.5

v5.2.4 was a live-test harness release. v5.2.5 incorporates that harness and adds the deterministic control-plane changes motivated by the v5.2.3 real-project behavioral failures. A v5.2.3 installation can upgrade directly; installing v5.2.4 first is unnecessary.

```powershell
py -B .\migrate-opencode-v5.2.3-to-v5.2.5.py
opencode2 service restart
py -B .\validate-opencode-v5.2.5.py --model "opencode/muse-spark-1.2-contributor-free"
```

Do not run the live matrix as part of migration. First return to normal project work and validate deterministic tracker operations. Run behavioral/live testing separately when desired.

For a GitHub Project V2 sync, `.ai/integrations.json` must configure `work_management.provider=github`, `github.project_owner`/`owner`, `github.project_number`, and an authorized OpenCode GitHub connection. `.ai/tracker-policy.json` must authorize writes.
