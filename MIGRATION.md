# Upgrade to ADE 6.1.3

Upgrade a supported existing ADE installation with:

```powershell
py -B .\migrate-to-v6.1.3.py
opencode2 service restart
py -B .\validate-opencode.py
```

Supported predecessors are v4/v5, ADE 6.0.x through 6.0.11, ADE 6.1.0, ADE 6.1.1, and ADE 6.1.2. The migration preserves user-owned configuration and the external durable-kernel journal.

The Observation Plane remains additive and noncanonical. ADE 6.1.3 can read existing 6.1.0 durable state; filesystem BUILD baselines are created only for new/resumed BUILD jobs that actually enter filesystem-evidence mode.

The installer remains fail-closed on managed-file or managed-agent ownership conflicts. Use `install-opencode.py` for a fresh installation.

## 6.1.3 policy bootstrap

If an existing human-owned execution policy is already `authorized:true` but has an empty/missing standard check map, the first engineering admission may register ADE safe presets for `tsc-noEmit`, `dist-build`, and `premium-grep-zero`. The migration does not self-authorize a project and does not overwrite explicit check definitions or vetoes.
