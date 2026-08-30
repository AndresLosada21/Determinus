from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from .common import (
    ADEError, AGENTS, PLUGIN_ID, VERSION, assert_safe_chain, assert_tree_no_links, config_env, copy_file_verified,
    dump_json, find_opencode_cli, is_reparse, iter_files, load_jsonc, package_root, read_text, run_cmd, sha256_file,
    within, write_text,
)
from .regression import run_regression

BEGIN = "<!-- AI-DRIVEN-ENGINEERING:BEGIN v5 -->"
END = "<!-- AI-DRIVEN-ENGINEERING:END v5 -->"


def _default_target() -> Path:
    return Path.home() / ".config" / "opencode"


def _backup_base(target: Path) -> Path:
    default = _default_target().resolve(strict=False)
    t = target.resolve(strict=False)
    if t == default:
        return target / ".ai-driven-backups"
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "opencode" / "ai-driven-backups"
    else:
        base = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state"))) / "opencode" / "ai-driven-backups"
    if within(base, target):
        raise ADEError("BACKUP_LOCATION_INVALID: backup ficaria dentro do target customizado")
    return base


def _backup_file(path: Path, target: Path, backup_root: Path, records: dict[str, str]) -> None:
    if not path.exists():
        return
    if is_reparse(path):
        raise ADEError(f"BACKUP_UNSAFE: {path}")
    try:
        rel = path.resolve(strict=False).relative_to(target.resolve(strict=False)).as_posix()
        key = f"target/{rel}"
    except ValueError:
        key = f"external/{path.name}"
    dest = backup_root / "prior" / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest, follow_symlinks=False)
    records[str(path)] = str(dest)


def _managed_copy(src_root: Path, dst_root: Path, target: Path, backup_root: Path, prior: dict[str, str], *, force: bool, previous_hashes: dict[str, str] | None = None, created_paths: set[Path] | None = None) -> dict[str, str]:
    assert_tree_no_links(src_root)
    previous_hashes = previous_hashes or {}
    created_paths = created_paths if created_paths is not None else set()
    hashes: dict[str, str] = {}
    for src in iter_files(src_root):
        rel = src.relative_to(src_root).as_posix()
        dst = dst_root / Path(rel)
        assert_safe_chain(dst.parent)
        if dst.exists():
            if is_reparse(dst):
                raise ADEError(f"INSTALL_UNSAFE: destino gerenciado é link/reparse {dst}")
            current_hash = sha256_file(dst)
            source_hash = sha256_file(src)
            if current_hash != source_hash and not force:
                # A version upgrade may replace a file only when the file on disk is
                # still byte-for-byte the one recorded by the previous ADE manifest.
                # A user-modified managed file remains a hard conflict.
                old_hash = previous_hashes.get(rel)
                if not old_hash or str(old_hash).lower() != current_hash.lower():
                    raise ADEError(f"INSTALL_CONFLICT: arquivo gerenciado modificado {dst}; use --force após revisar")
            _backup_file(dst, target, backup_root, prior)
        else:
            created_paths.add(dst)
        hashes[rel] = copy_file_verified(src, dst)
    return hashes


def _config_candidate(base: dict[str, Any], *, default_agent: bool) -> dict[str, Any]:
    # Native V2: top-level subagent_depth is accepted-but-unsupported. Canonicalize to experimental.subagent_depth.
    cfg = json.loads(json.dumps(base))
    cfg.pop("subagent_depth", None)
    if default_agent:
        cfg["default_agent"] = "orchestrator"
    exp = cfg.get("experimental")
    if not isinstance(exp, dict):
        exp = {}
        cfg["experimental"] = exp
    exp["subagent_depth"] = 2
    return cfg


def _preflight_config(cli: str | None, candidate: dict[str, Any], config_name: str) -> tuple[bool, str]:
    if not cli:
        return True, "cli-unavailable"
    with tempfile.TemporaryDirectory(prefix="ade-config-preflight-") as td:
        d = Path(td)
        dump_json(d / config_name, candidate)
        r = run_cmd([cli, "debug", "config"], env=config_env(d), timeout=45)
        return r.code == 0, r.combined


def _patch_config(target: Path, *, default_agent: bool, skip_runtime_check: bool, backup_root: Path, prior: dict[str, str]) -> dict[str, Any]:
    candidates = [target / "opencode.jsonc", target / "opencode.json"]
    path = next((p for p in candidates if p.exists()), candidates[0])
    assert_safe_chain(path.parent)
    base = load_jsonc(path) if path.exists() else {}
    cli = None if skip_runtime_check else find_opencode_cli()
    chosen = _config_candidate(base, default_agent=default_agent)
    ok, detail = _preflight_config(cli, chosen, path.name)
    if not ok:
        raise ADEError(f"CONFIG_PREFLIGHT_FAILED experimental.subagent_depth: {detail}")

    version_text = ""
    if cli:
        vr = run_cmd([cli, "--version"], timeout=20)
        version_text = vr.combined.strip()
    old_hash = sha256_file(path) if path.exists() else None
    _backup_file(path, target, backup_root, prior)
    dump_json(path, chosen)
    new_hash = sha256_file(path)
    if cli and not skip_runtime_check:
        r = run_cmd([cli, "debug", "config"], env=config_env(target), timeout=45)
        if r.code != 0:
            raise ADEError(f"CONFIG_POSTWRITE_FAILED: {r.combined}")
    return {"path": str(path), "old_hash": old_hash, "new_hash": new_hash, "subagent_depth_mode": "experimental-v2", "cli": cli, "cli_version": version_text}


def _patch_ambient(target: Path, managed: str, backup_root: Path, prior: dict[str, str]) -> dict[str, Any]:
    path = target / "AGENTS.md"
    existing = read_text(path) if path.exists() else ""
    start = existing.find(BEGIN)
    end = existing.find(END)
    if start >= 0 and end >= start:
        end += len(END)
        new = existing[:start].rstrip() + "\n\n" + managed.strip() + "\n" + existing[end:].lstrip("\r\n")
    else:
        prefix = existing.rstrip()
        new = (prefix + "\n\n" if prefix else "") + managed.strip() + "\n"
    old_hash = sha256_file(path) if path.exists() else None
    _backup_file(path, target, backup_root, prior)
    write_text(path, new)
    return {"path": str(path), "old_hash": old_hash, "new_hash": sha256_file(path)}


def install(*, target: Path | None = None, force: bool = False, no_default_agent: bool = False,
            no_config_patch: bool = False, no_ambient_instructions: bool = False,
            skip_runtime_check: bool = False, skip_regression: bool = False) -> dict[str, Any]:
    root = package_root()
    if read_text(root / "VERSION").strip() != VERSION:
        raise ADEError("PACKAGE_VERSION_INVALID")
    if not skip_regression:
        run_regression(root)

    target = (target or _default_target()).expanduser().absolute()
    assert_safe_chain(target.parent)
    target.mkdir(parents=True, exist_ok=True)
    if is_reparse(target):
        raise ADEError(f"INSTALL_UNSAFE: target é reparse {target}")

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S%f") + "-" + uuid.uuid4().hex
    backup_root = _backup_base(target) / stamp
    backup_root.mkdir(parents=True, exist_ok=False)
    prior: dict[str, str] = {}
    created_paths: set[Path] = set()

    previous_manifest = target / "ai-driven-engineering-install.json"
    previous_manifest_data: dict[str, Any] = {}
    if previous_manifest.is_file():
        try:
            loaded = json.loads(read_text(previous_manifest))
            if isinstance(loaded, dict):
                previous_manifest_data = loaded
        except Exception as exc:
            raise ADEError(f"INSTALL_BLOCKED: manifesto anterior inválido: {exc}") from exc
    if not previous_manifest.exists(): created_paths.add(previous_manifest)
    _backup_file(previous_manifest, target, backup_root, prior)

    def old_files(section: str) -> dict[str, str]:
        raw = previous_manifest_data.get(section) or {}
        if section == "agents":
            return raw if isinstance(raw, dict) else {}
        if isinstance(raw, dict) and isinstance(raw.get("files"), dict):
            return raw["files"]
        return {}

    try:
        agent_hashes: dict[str, str] = {}
        for name in AGENTS:
            src = root / "agents" / f"{name}.md"
            dst = target / "agents" / f"{name}.md"
            if dst.exists():
                if sha256_file(dst) != sha256_file(src) and not force:
                    # Upgrades from a known ADE manifest may legitimately replace prior managed files.
                    old_hash = old_files("agents").get(f"{name}.md")
                    allow = bool(old_hash and str(old_hash).lower() == sha256_file(dst).lower())
                    if not allow:
                        raise ADEError(f"INSTALL_CONFLICT: agent modificado {dst}; use --force após revisar")
                _backup_file(dst, target, backup_root, prior)
            else:
                created_paths.add(dst)
            agent_hashes[f"{name}.md"] = copy_file_verified(src, dst)

        skill_hashes = _managed_copy(root / "skills/ai-driven-engineering", target / "skills/ai-driven-engineering", target, backup_root, prior, force=force, previous_hashes=old_files("skill"), created_paths=created_paths)
        runtime_hashes = _managed_copy(root / "runtime", target / "ai-driven-engineering/runtime", target, backup_root, prior, force=force, previous_hashes=old_files("runtime"), created_paths=created_paths)
        tooling_hashes = _managed_copy(root / "tooling", target / "ai-driven-engineering/tooling", target, backup_root, prior, force=force, previous_hashes=old_files("tooling"), created_paths=created_paths)
        plugin_hashes = _managed_copy(root / "plugin", target / "plugins/ai-driven-engineering", target, backup_root, prior, force=force, previous_hashes=old_files("plugin"), created_paths=created_paths)

        config_info = {"patched": False}
        if not no_config_patch:
            config_candidates=[target / "opencode.jsonc", target / "opencode.json"]
            config_path=next((x for x in config_candidates if x.exists()), config_candidates[0])
            if not config_path.exists(): created_paths.add(config_path)
            config_info = {"patched": True, **_patch_config(target, default_agent=not no_default_agent, skip_runtime_check=skip_runtime_check, backup_root=backup_root, prior=prior)}

        ambient_info = {"patched": False}
        if not no_ambient_instructions:
            ambient_path=target / "AGENTS.md"
            if not ambient_path.exists(): created_paths.add(ambient_path)
            ambient_info = {"patched": True, **_patch_ambient(target, read_text(root / "AGENTS.managed.md"), backup_root, prior)}

        manifest = {
            "schema_version": 7,
            "package_version": VERSION,
            "plugin": {"id": PLUGIN_ID, "path": str(target / "plugins/ai-driven-engineering"), "files": plugin_hashes, "version": VERSION},
            "agents": agent_hashes,
            "skill": {"files": skill_hashes},
            "runtime": {"files": runtime_hashes},
            "tooling": {"files": tooling_hashes, "python": f"{os.sys.version_info.major}.{os.sys.version_info.minor}.{os.sys.version_info.micro}"},
            "config": config_info,
            "ambient": ambient_info,
            "backup_root": str(backup_root),
            "prior_files": prior,
            "installed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "validation_state": "INSTALLED_RUNTIME_PENDING",
        }
        dump_json(previous_manifest, manifest)
        print(f"ADE v{VERSION} instalado em: {target}")
        print(f"Agents: {len(agent_hashes)} | Plugin tools: 26 | Manifest schema: 7")
        if config_info.get("patched"):
            print(f"subagent_depth_mode: {config_info.get('subagent_depth_mode')}")
        print("INSTALL_V5_2_2_OK")
        return manifest
    except Exception:
        # Transactional rollback: delete files created by this attempt, then restore every backed-up original.
        for created in sorted(created_paths, key=lambda x: len(x.parts), reverse=True):
            try:
                if created.is_file() or created.is_symlink(): created.unlink(missing_ok=True)
            except Exception:
                pass
        for original, backup in sorted(prior.items(), reverse=True):
            try:
                src = Path(backup)
                dst = Path(original)
                if src.exists():
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
            except Exception:
                pass
        for d in (target/"plugins/ai-driven-engineering", target/"ai-driven-engineering", target/"skills/ai-driven-engineering", target/"agents"):
            try:
                cur=d
                while within(cur,target) and cur!=target:
                    cur.rmdir(); cur=cur.parent
            except Exception:
                pass
        raise
