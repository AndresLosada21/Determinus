from __future__ import annotations

from pathlib import Path

from .common import ADEError, VERSION, load_json
from .install import install


def migrate(*, target: Path | None = None, force: bool = False, skip_runtime_check: bool = False) -> dict:
    target = (target or (Path.home()/".config"/"opencode")).expanduser().absolute()
    manifest = target / "ai-driven-engineering-install.json"
    if not manifest.is_file():
        raise ADEError("MIGRATION_BLOCKED: manifesto ADE anterior ausente")
    old = load_json(manifest)
    current = str(old.get("package_version", ""))
    if not (current.startswith("4.") or current.startswith("5.0.") or current.startswith("5.1.") or current in {"5.2.0","5.2.1"}):
        raise ADEError(f"MIGRATION_BLOCKED: esperado v4.x/5.0.x/5.1.x/5.2.0/5.2.1; atual={current}")
    print(f"Migrando ADE {current} -> {VERSION}")
    result = install(target=target, force=force, skip_runtime_check=skip_runtime_check)
    if result.get("package_version") != VERSION:
        raise ADEError("MIGRATION_FAILED: manifesto final divergente")
    print("MIGRATION_TO_V5_2_2_OK")
    print("Reinicie o OpenCode V2, abra sessão nova e rode validate/assurance com --model.")
    return result
