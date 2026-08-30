from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .common import ADEError, VERSION, load_json, safe_relative, safe_rmtree_if_empty, sha256_file


def _restore_or_remove(dst: Path, installed_hash: str, backup: Path | None, target: Path, preserved: list[str]) -> None:
    if dst.exists():
        if not dst.is_file() or sha256_file(dst).lower() != installed_hash.lower():
            preserved.append(str(dst))
            return
        dst.unlink()
    if backup and backup.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup, dst)
    else:
        safe_rmtree_if_empty(dst.parent, target)


def uninstall(*, target: Path | None = None) -> dict[str, Any]:
    target = (target or (Path.home()/".config"/"opencode")).expanduser().absolute()
    manifest_path = target / "ai-driven-engineering-install.json"
    if not manifest_path.is_file():
        raise ADEError(f"UNINSTALL_BLOCKED: manifesto ausente {manifest_path}")
    m = load_json(manifest_path)
    if str(m.get("package_version")) != VERSION or int(m.get("schema_version",0)) != 7:
        raise ADEError(f"UNINSTALL_BLOCKED: manifesto não é v{VERSION}/schema7")
    prior = {Path(k): Path(v) for k,v in (m.get("prior_files") or {}).items()}
    preserved: list[str] = []

    sections = [
        (target/"agents", m.get("agents") or {}),
        (target/"skills/ai-driven-engineering", (m.get("skill") or {}).get("files") or {}),
        (target/"ai-driven-engineering/runtime", (m.get("runtime") or {}).get("files") or {}),
        (target/"ai-driven-engineering/tooling", (m.get("tooling") or {}).get("files") or {}),
        (target/"plugins/ai-driven-engineering", (m.get("plugin") or {}).get("files") or {}),
    ]
    for root, entries in sections:
        for rel, h in entries.items():
            if not safe_relative(rel):
                raise ADEError(f"UNINSTALL_BLOCKED: unsafe manifest path {rel}")
            dst = root / Path(rel)
            _restore_or_remove(dst, str(h), prior.get(dst), target, preserved)

    # Config/ambient: restore only if they are still exactly what the installer wrote.
    for key in ("config", "ambient"):
        info = m.get(key) or {}
        if not info.get("patched"):
            continue
        p = Path(str(info.get("path", "")))
        new_hash = info.get("new_hash")
        if not p or not new_hash:
            continue
        backup = prior.get(p)
        if p.is_file() and sha256_file(p).lower() == str(new_hash).lower():
            p.unlink()
            if backup and backup.is_file():
                p.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup, p)
        elif p.exists():
            preserved.append(str(p))

    # Restore prior manifest when available; otherwise remove current one.
    prior_manifest = prior.get(manifest_path)
    if prior_manifest and prior_manifest.is_file():
        shutil.copy2(prior_manifest, manifest_path)
    else:
        manifest_path.unlink(missing_ok=True)

    print(f"UNINSTALL_V5_2_0_OK: preserved_modified={len(preserved)}")
    for p in preserved:
        print(f"PRESERVED_MODIFIED: {p}")
    return {"preserved": preserved}
