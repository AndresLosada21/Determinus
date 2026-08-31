# Migration - ADE 6.0.2 to 6.0.3

```powershell
py -B .\migrate-v6.0.2-to-v6.0.3.py
opencode2 service restart
py -B .\validate-opencode.py --model "openai/gpt-5.6-terra"
```

The migration explicitly registers the managed native plugin in `opencode.json(c)`. Do not use `--force` unless the migrator reports a reviewed modification to a managed file.
