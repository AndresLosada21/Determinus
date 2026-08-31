from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from .common import ADEError, VERSION, assert_safe_chain, copy_file_atomic, is_reparse, load_json, safe_relative, safe_rmtree_if_empty, secure_file, secure_mkdir, sha256_file, within


def _default_target() -> Path:
    return Path.home() / ".config" / "opencode"


def _expected_backup_base(target: Path) -> Path:
    if target.resolve(strict=False) == _default_target().resolve(strict=False):
        return target / ".ai-driven-backups"
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "opencode" / "ai-driven-backups"
    return Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state"))) / "opencode" / "ai-driven-backups"


def _validate_backup(backup: Path | None, backup_root: Path) -> Path | None:
    if backup is None:
        return None
    if not within(backup, backup_root) or is_reparse(backup):
        raise ADEError(f"UNINSTALL_BLOCKED: backup inseguro {backup}")
    return backup


def _restore_or_remove(dst: Path, installed_hash: str, backup: Path | None, target: Path, preserved: list[str]) -> None:
    if dst.exists():
        if is_reparse(dst):
            raise ADEError(f"UNINSTALL_BLOCKED: managed destination is link/reparse {dst}")
        if not dst.is_file() or sha256_file(dst).lower() != installed_hash.lower():
            preserved.append(str(dst))
            return
        dst.unlink()
    if backup and backup.is_file():
        assert_safe_chain(dst.parent)
        secure_mkdir(dst.parent)
        copy_file_atomic(backup, dst)
    else:
        safe_rmtree_if_empty(dst.parent, target)


def uninstall(*, target: Path | None = None) -> dict[str, Any]:
    target = (target or (Path.home()/".config"/"opencode")).expanduser().absolute()
    manifest_path = target / "ai-driven-engineering-install.json"
    assert_safe_chain(target)
    if manifest_path.exists() and is_reparse(manifest_path):
        raise ADEError(f"UNINSTALL_BLOCKED: manifesto é link/reparse {manifest_path}")
    if not manifest_path.is_file():
        raise ADEError(f"UNINSTALL_BLOCKED: manifesto ausente {manifest_path}")
    m = load_json(manifest_path)
    if str(m.get("package_version")) != VERSION or int(m.get("schema_version",0)) != 7:
        raise ADEError(f"UNINSTALL_BLOCKED: manifesto não é v{VERSION}/schema7")
    expected_base = _expected_backup_base(target).resolve(strict=False)
    assert_safe_chain(expected_base)
    backup_root = Path(str(m.get("backup_root", ""))).resolve(strict=False)
    assert_safe_chain(backup_root)
    if not within(backup_root, expected_base) or backup_root == expected_base:
        raise ADEError(f"UNINSTALL_BLOCKED: backup_root fora da área permitida {backup_root}")
    raw_prior = m.get("prior_files") or {}
    if not isinstance(raw_prior, dict):
        raise ADEError("UNINSTALL_BLOCKED: prior_files inválido")
    prior: dict[Path, Path] = {}
    for k, v in raw_prior.items():
        dst, bkp = Path(str(k)).resolve(strict=False), Path(str(v)).resolve(strict=False)
        if not within(dst, target):
            raise ADEError(f"UNINSTALL_BLOCKED: prior destination fora do target {dst}")
        prior[dst] = _validate_backup(bkp, backup_root) or bkp
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
            _restore_or_remove(dst, str(h), prior.get(dst.resolve(strict=False)), target, preserved)

    # Config/ambient: restore only if they are still exactly what the installer wrote.
    for key in ("config", "ambient"):
        info = m.get(key) or {}
        if not info.get("patched"):
            continue
        p = Path(str(info.get("path", ""))).resolve(strict=False)
        allowed = { (target / "AGENTS.md").resolve(strict=False) } if key == "ambient" else { (target / "opencode.json").resolve(strict=False), (target / "opencode.jsonc").resolve(strict=False) }
        if p not in allowed:
            raise ADEError(f"UNINSTALL_BLOCKED: {key}.path inesperado {p}")
        new_hash = info.get("new_hash")
        if not new_hash:
            continue
        backup = prior.get(p)
        if p.is_file() and sha256_file(p).lower() == str(new_hash).lower():
            p.unlink()
            if backup and backup.is_file():
                assert_safe_chain(p.parent)
                secure_mkdir(p.parent)
                copy_file_atomic(backup, p)
        elif p.exists():
            preserved.append(str(p))

    # Restore prior manifest when available; otherwise remove current one.
    prior_manifest = prior.get(manifest_path.resolve(strict=False))
    if prior_manifest and prior_manifest.is_file():
        copy_file_atomic(prior_manifest, manifest_path)
    else:
        manifest_path.unlink(missing_ok=True)

    print(f"UNINSTALL_V6_0_7_OK: preserved_modified={len(preserved)}")
    for p in preserved:
        print(f"PRESERVED_MODIFIED: {p}")
    return {"preserved": preserved}
