# Migration v5.2.8 → ADE 6.0.0

ADE 6 replaces the orchestration architecture while preserving hardened adapters and transactional installer rollback.

## Upgrade

From the v6 release bundle:

```powershell
py -B .\migrate-opencode-v5.2.8-to-v6.0.0.py
opencode2 service restart
py -B .\validate-opencode-v6.0.0.py --model "opencode/muse-spark-1.2-contributor-free"
```

Do not use `--force` unless the migrator explicitly reports a user-modified managed file and you have reviewed that conflict.

## What is replaced

- plugin runtime;
- active agent capability surface;
- managed agent files (13 become disabled v5 tombstones);
- skill/runtime/tooling files;
- managed ambient AGENTS block (`v5` marker is replaced with `v6`);
- OpenCode compatibility fragment (`experimental.subagent_depth=1`).

## What is preserved

- project source files;
- project `.ai/*` configuration/history files;
- exact-effect authorization policies;
- installer backup of the prior managed ADE release.

Existing `.ai/control.json` is preserved but is no longer canonical. On first v6 use, a compact representation may be imported to the external kernel journal as legacy/non-authoritative history.

## Rollback

Run the v6 uninstaller. It restores the previous managed ADE installation from the transactional backup, including the previous plugin/agents/skill/tooling and ambient/config files when unchanged by the user after install.

Kernel journals created under the user state directory are historical project data and are not silently deleted by rollback.
