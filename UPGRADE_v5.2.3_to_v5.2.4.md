# Upgrade ADE v5.2.3 → v5.2.4

v5.2.4 keeps the v5.2.3 agent/runtime contracts and adds the live multi-model integration matrix. No state schema or typed-tool count changes.

```powershell
py -B .\migrate-v4-to-v5.py
```

or, from the outer release bundle, use the dedicated `migrate-opencode-v5.2.3-to-v5.2.4.py` wrapper.

After restart:

```powershell
py -B .\validate-opencode-v5.2.4.py --model "opencode/muse-spark-1.2-contributor-free"
py -B .\assure-opencode-v5.2.4.py --source --model "opencode/muse-spark-1.2-contributor-free"
py -B .\live-test-opencode-v5.2.4.py --trials 3
```

The live matrix operates only in synthetic temporary projects. It does not sync the current repository or its real tracker.
