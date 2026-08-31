# Migration - ADE 6.0.1 to 6.0.2

ADE 6.0.2 is a safety patch for durable worker execution.

```powershell
py -B .\migrate-v6.0.1-to-v6.0.2.py
opencode2 service restart
py -B .\validate-opencode.py --model "openai/gpt-5.6-terra"
```

The managed migrator preserves the prior ADE 6.0.1 installation for rollback. Do not use `--force` unless it reports a reviewed user modification to a managed file.
