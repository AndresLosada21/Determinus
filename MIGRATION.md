# Upgrade to ADE 6.0.11

Use the generic managed upgrader for an existing ADE installation:

```powershell
py -B .\migrate-to-v6.0.11.py
opencode2 service restart
py -B .\validate-opencode.py
```

The upgrader accepts supported pre-6.0.11 ADE manifests, preserves user-owned configuration, and fails closed on managed-file or managed-agent conflicts. Use `install-opencode.py` for a fresh installation.
