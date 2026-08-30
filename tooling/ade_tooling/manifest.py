from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .common import ADEError, PLUGIN_ID, VERSION, load_json, safe_relative, sha256_file


def _assert_section(name: str, root: Path, entries: dict[str, str]) -> None:
    if not isinstance(entries, dict):
        raise ADEError(f"MANIFEST_INVALID: section {name} files ausente")
    for rel, expected in entries.items():
        if not safe_relative(rel):
            raise ADEError(f"MANIFEST_INVALID: unsafe {name} path {rel}")
        p = root / Path(rel)
        if not p.is_file():
            raise ADEError(f"INSTALL_INTEGRITY_FAILED: {name} file ausente {rel}")
        actual = sha256_file(p)
        if actual.lower() != str(expected).lower():
            raise ADEError(f"INSTALL_INTEGRITY_FAILED: {name} hash divergente {rel}")


def validate_installed_manifest(target: Path) -> dict[str, Any]:
    path = target / "ai-driven-engineering-install.json"
    if not path.is_file():
        raise ADEError(f"MANIFEST_NOT_FOUND: {path}")
    m = load_json(path)
    if int(m.get("schema_version", 0)) != 7:
        raise ADEError(f"MANIFEST_INVALID: schema esperado=7 atual={m.get('schema_version')}")
    if str(m.get("package_version")) != VERSION:
        raise ADEError(f"MANIFEST_INVALID: package esperado={VERSION} atual={m.get('package_version')}")
    if str((m.get("plugin") or {}).get("id")) != PLUGIN_ID:
        raise ADEError("MANIFEST_INVALID: plugin id")

    _assert_section("agents", target / "agents", m.get("agents"))
    _assert_section("skill", target / "skills/ai-driven-engineering", (m.get("skill") or {}).get("files"))
    _assert_section("runtime", target / "ai-driven-engineering/runtime", (m.get("runtime") or {}).get("files"))
    _assert_section("tooling", target / "ai-driven-engineering/tooling", (m.get("tooling") or {}).get("files"))
    _assert_section("plugin", target / "plugins/ai-driven-engineering", (m.get("plugin") or {}).get("files"))
    if len(m.get("agents") or {}) != 18:
        raise ADEError(f"INSTALL_INTEGRITY_FAILED: agents manifesto={len(m.get('agents') or {})} esperado=18")
    if not (target / "plugins/ai-driven-engineering/capabilities.json").is_file():
        raise ADEError("INSTALL_INTEGRITY_FAILED: capabilities.json ausente")
    print(f"INSTALLED_MANIFEST_VALIDATED: schema=7 package={VERSION} agents=18 plugin={PLUGIN_ID}")
    return m
