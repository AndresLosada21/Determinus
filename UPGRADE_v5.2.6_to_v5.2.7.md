# Upgrade v5.2.6 → v5.2.7

Use the release-bundle wrapper:

```powershell
py -B .\migrate-opencode-v5.2.6-to-v5.2.7.py
opencode2 service restart
py -B .\validate-opencode-v5.2.7.py --model "opencode/muse-spark-1.2-contributor-free"
```

Migration is FAST PATH and does not run behavioral/live matrices. After Core+Contract pass, run the Windows plugin suite from the bundled source (`npm test`) and then retry the real Project Manager snapshot.

Do not hotpatch `~/.config/opencode`; rebuild source if a gate fails.
