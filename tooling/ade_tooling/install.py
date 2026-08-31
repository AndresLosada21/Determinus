from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from .common import (
    ADEError, AGENTS, PLUGIN_ID, VERSION, assert_safe_chain, assert_tree_no_links, config_env, copy_file_atomic, copy_file_verified,
    dump_json, find_opencode_cli, is_reparse, iter_files, jsonc_has_extended_syntax, load_jsonc, package_root, parse_frontmatter, read_text, run_cmd, sha256_file,
    secure_file, secure_mkdir, within, write_text,
)
from .regression import run_regression

LEGACY_BEGIN = "<!-- AI-DRIVEN-ENGINEERING:BEGIN v5 -->"
LEGACY_END = "<!-- AI-DRIVEN-ENGINEERING:END v5 -->"
BEGIN = "<!-- AI-DRIVEN-ENGINEERING:BEGIN v6 -->"
END = "<!-- AI-DRIVEN-ENGINEERING:END v6 -->"


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
    secure_mkdir(dest.parent)
    copy_file_atomic(path, dest)
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


def _agent_definition_hash(value: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()


def managed_agent_definitions(root: Path) -> dict[str, dict[str, Any]]:
    definitions: dict[str, dict[str, Any]] = {}
    allowed = {"description", "mode", "hidden", "steps", "disabled", "permissions"}
    for name in AGENTS:
        frontmatter, body = parse_frontmatter(root / "agents" / f"{name}.md")
        definition = {key: value for key, value in frontmatter.items() if key in allowed}
        definition["system"] = body.strip()
        definitions[name] = definition
    return definitions


def _merge_managed_agents(base: dict[str, Any], managed: dict[str, dict[str, Any]], previous: dict[str, str] | None) -> dict[str, Any]:
    existing = base.get("agents")
    if existing is None:
        existing = {}
    if not isinstance(existing, dict):
        raise ADEError("CONFIG_AGENTS_INVALID: agents must be an object")
    merged = json.loads(json.dumps(existing))
    previous = previous or {}
    for name, definition in managed.items():
        current = merged.get(name)
        known = previous.get(name)
        current_hash = _agent_definition_hash(current) if isinstance(current, dict) else None
        if current is None or current == definition or (known and current_hash == known):
            merged[name] = definition
            continue
        raise ADEError(f"CONFIG_AGENT_CONFLICT: managed agent {name} has user-owned configuration")
    return merged


def _config_candidate(base: dict[str, Any], *, default_agent: bool, managed_agents: dict[str, dict[str, Any]] | None = None,
                      previous_agent_hashes: dict[str, str] | None = None) -> dict[str, Any]:
    # ADE v6 creates worker sessions programmatically; raw native subagent recursion is denied.
    # Keep a shallow V2-compatible depth only as a host compatibility guard.
    cfg = json.loads(json.dumps(base))
    cfg.pop("subagent_depth", None)
    if default_agent:
        cfg["default_agent"] = "orchestrator"
    if managed_agents is not None:
        cfg["agents"] = _merge_managed_agents(cfg, managed_agents, previous_agent_hashes)
    # Recent OpenCode V2 builds do not discover this package directory implicitly.
    # Keep an explicit relative entry so the managed native plugin and its tools load.
    plugin_entry = "./plugins/ai-driven-engineering"
    plugins = cfg.get("plugins")
    if plugins is None:
        cfg["plugins"] = [plugin_entry]
    elif not isinstance(plugins, list):
        raise ADEError("CONFIG_PLUGINS_INVALID: plugins must be an array")
    elif plugin_entry not in plugins:
        plugins.append(plugin_entry)
    exp = cfg.get("experimental")
    if not isinstance(exp, dict):
        exp = {}
        cfg["experimental"] = exp
    exp["subagent_depth"] = 1
    return cfg


def _preflight_config(cli: str | None, candidate: dict[str, Any], config_name: str) -> tuple[bool, str]:
    if not cli:
        return True, "cli-unavailable"
    with tempfile.TemporaryDirectory(prefix="ade-config-preflight-") as td:
        d = Path(td)
        dump_json(d / config_name, candidate)
        r = run_cmd([cli, "debug", "config"], env=config_env(d), timeout=45)
        return r.code == 0, r.combined


def _patch_config(target: Path, *, root: Path, default_agent: bool, skip_runtime_check: bool, backup_root: Path, prior: dict[str, str],
                  previous_agent_hashes: dict[str, str] | None = None) -> dict[str, Any]:
    candidates = [target / "opencode.jsonc", target / "opencode.json"]
    path = next((p for p in candidates if p.exists()), candidates[0])
    assert_safe_chain(path.parent)
    if path.exists() and path.suffix.lower() == ".jsonc":
        raw = read_text(path)
        if jsonc_has_extended_syntax(raw):
            raise ADEError("CONFIG_JSONC_PRESERVATION_BLOCKED: opencode.jsonc contém comentários/trailing commas; use --no-config-patch e preserve o arquivo manualmente")
    base = load_jsonc(path) if path.exists() else {}
    cli = None if skip_runtime_check else find_opencode_cli()
    managed_agents = managed_agent_definitions(root)
    chosen = _config_candidate(base, default_agent=default_agent, managed_agents=managed_agents, previous_agent_hashes=previous_agent_hashes)
    ok, detail = _preflight_config(cli, chosen, path.name)
    if not ok:
        raise ADEError(f"CONFIG_PREFLIGHT_FAILED v6 experimental.subagent_depth: {detail}")

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
    registered = chosen.get("agents") or {}
    hashes = {name: _agent_definition_hash(registered[name]) for name in managed_agents}
    return {"path": str(path), "old_hash": old_hash, "new_hash": new_hash, "subagent_depth_mode": "experimental-v2", "cli": cli, "cli_version": version_text, "managed_agents_registered": sorted(managed_agents), "managed_agent_hashes": hashes}


def _patch_ambient(target: Path, managed: str, backup_root: Path, prior: dict[str, str]) -> dict[str, Any]:
    path = target / "AGENTS.md"
    existing = read_text(path) if path.exists() else ""
    blocks = []
    for b, e, label in ((BEGIN, END, "v6"), (LEGACY_BEGIN, LEGACY_END, "v5")):
        bc, ec = existing.count(b), existing.count(e)
        if (bc, ec) not in {(0, 0), (1, 1)}:
            raise ADEError(f"AMBIENT_MARKERS_INVALID: {label} BEGIN={bc} END={ec}")
        if bc == 1:
            start, end = existing.find(b), existing.find(e)
            if end < start:
                raise ADEError(f"AMBIENT_MARKERS_INVALID: {label} END precede BEGIN")
            blocks.append((start, end + len(e), label))
    if len(blocks) > 1:
        raise ADEError("AMBIENT_MARKERS_INVALID: simultaneous v5 and v6 managed blocks")
    if blocks:
        start, end, _ = blocks[0]
        new = existing[:start].rstrip() + "\n\n" + managed.strip() + "\n" + existing[end:].lstrip("\r\n")
    else:
        prefix = existing.rstrip()
        new = (prefix + "\n\n" if prefix else "") + managed.strip() + "\n"
    old_hash = sha256_file(path) if path.exists() else None
    _backup_file(path, target, backup_root, prior)
    write_text(path, new)
    return {"path": str(path), "old_hash": old_hash, "new_hash": sha256_file(path)}


def _assert_target_safe(target: Path) -> None:
    resolved = target.resolve(strict=False)
    if resolved == Path(resolved.anchor) or resolved == Path.home().resolve(strict=False):
        raise ADEError(f"INSTALL_UNSAFE_TARGET: {resolved}")
    assert_safe_chain(target.parent)


def _prune_backups(base: Path, current: Path, keep: int = 10) -> None:
    if not base.exists() or is_reparse(base):
        return
    dirs = [p for p in base.iterdir() if p.is_dir() and not is_reparse(p)]
    dirs.sort(key=lambda p: p.name, reverse=True)
    protected = {current.resolve(strict=False)}
    kept = 0
    for d in dirs:
        if d.resolve(strict=False) in protected or kept < keep - 1:
            kept += 1
            continue
        try:
            shutil.rmtree(d)
        except OSError:
            pass


def install(*, target: Path | None = None, force: bool = False, no_default_agent: bool = False,
            no_config_patch: bool = False, no_ambient_instructions: bool = False,
            skip_runtime_check: bool = False, skip_regression: bool = False) -> dict[str, Any]:
    root = package_root()
    if read_text(root / "VERSION").strip() != VERSION:
        raise ADEError("PACKAGE_VERSION_INVALID")
    if not skip_regression:
        run_regression(root)

    target = (target or _default_target()).expanduser().absolute()
    _assert_target_safe(target)
    secure_mkdir(target)
    if is_reparse(target):
        raise ADEError(f"INSTALL_UNSAFE: target é reparse {target}")

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S%f") + "-" + uuid.uuid4().hex
    backup_base = _backup_base(target)
    secure_mkdir(backup_base)
    backup_root = backup_base / stamp
    backup_root.mkdir(parents=True, exist_ok=False, mode=0o700)
    if os.name != "nt": backup_root.chmod(0o700)
    prior: dict[str, str] = {}
    created_paths: set[Path] = set()

    previous_manifest = target / "ai-driven-engineering-install.json"
    previous_manifest_data: dict[str, Any] = {}
    if previous_manifest.exists() and is_reparse(previous_manifest):
        raise ADEError(f"INSTALL_BLOCKED: manifesto anterior é link/reparse {previous_manifest}")
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

    previous_agent_hashes = previous_manifest_data.get("managed_agent_config")
    if not isinstance(previous_agent_hashes, dict):
        previous_agent_hashes = {}

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
            config_info = {"patched": True, **_patch_config(target, root=root, default_agent=not no_default_agent, skip_runtime_check=skip_runtime_check, backup_root=backup_root, prior=prior, previous_agent_hashes=previous_agent_hashes)}

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
            "managed_agent_config": config_info.get("managed_agent_hashes", previous_agent_hashes),
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
        print(f"Managed agent files: {len(agent_hashes)} | Active workers: 5 | Plugin tools: 35 | Manifest schema: 7")
        if config_info.get("patched"):
            print(f"subagent_depth_mode: {config_info.get('subagent_depth_mode')}")
        _prune_backups(backup_base, backup_root, keep=10)
        print("INSTALL_V6_1_3_OK")
        return manifest
    except Exception as exc:
        # Transactional rollback: delete files created by this attempt, then restore every backed-up original.
        for created in sorted(created_paths, key=lambda x: len(x.parts), reverse=True):
            try:
                if created.is_file() or created.is_symlink(): created.unlink(missing_ok=True)
            except Exception:
                pass
        rollback_errors: list[str] = []
        for original, backup in sorted(prior.items(), reverse=True):
            try:
                src = Path(backup)
                dst = Path(original)
                if src.exists():
                    assert_safe_chain(dst.parent)
                    secure_mkdir(dst.parent)
                    copy_file_atomic(src, dst)
            except Exception as rollback_exc:
                rollback_errors.append(f"{original}: {rollback_exc}")
        for d in (target/"plugins/ai-driven-engineering", target/"ai-driven-engineering", target/"skills/ai-driven-engineering", target/"agents"):
            try:
                cur=d
                while within(cur,target) and cur!=target:
                    cur.rmdir(); cur=cur.parent
            except Exception:
                pass
        if rollback_errors:
            raise ADEError(f"{exc}; ROLLBACK_INCOMPLETE: {' | '.join(rollback_errors[:10])}") from exc
        raise
