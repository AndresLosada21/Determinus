# Upgrade to ADE 6.1.0

Use the generic managed upgrader for an existing ADE installation:

```powershell
py -B .\migrate-to-v6.1.0.py
opencode2 service restart
py -B .\validate-opencode.py
```

The upgrader accepts supported pre-6.1.0 ADE manifests, preserves user-owned configuration, and fails closed on managed-file or managed-agent conflicts. Existing external kernel journals are read without rewrite. Use `install-opencode.py` for a fresh installation.
