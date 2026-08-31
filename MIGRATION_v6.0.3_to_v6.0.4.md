# Migration - ADE 6.0.3 to 6.0.4

```powershell
py -B .\migrate-v6.0.3-to-v6.0.4.py
opencode2 service restart
```

The managed migration installs the native plugin root entrypoint required by OpenCode V2 beta-18721.
