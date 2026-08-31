from __future__ import annotations

from pathlib import Path

from .common import ADEError, VERSION, assert_safe_chain, is_reparse, load_json
from .install import install

def _supported_predecessor(version: str) -> bool:
    try:
        major, minor, patch = (int(part) for part in version.split(".", 2))
    except ValueError:
        return False
    return major in {4, 5} or (major == 6 and minor == 0 and 0 <= patch < 11)


def migrate(*, target: Path | None = None, force: bool = False, skip_runtime_check: bool = False) -> dict:
    target = (target or (Path.home()/".config"/"opencode")).expanduser().absolute()
    manifest = target / "ai-driven-engineering-install.json"
    assert_safe_chain(target)
    if manifest.exists() and is_reparse(manifest):
        raise ADEError(f"MIGRATION_BLOCKED: manifesto é link/reparse {manifest}")
    if not manifest.is_file():
        raise ADEError("MIGRATION_BLOCKED: manifesto ADE anterior ausente; use install para fresh install")
    old = load_json(manifest)
    current = str(old.get("package_version", ""))
    if current == VERSION:
        raise ADEError(f"MIGRATION_BLOCKED: ADE {VERSION} já instalado")
    if not _supported_predecessor(current):
        raise ADEError(f"MIGRATION_BLOCKED: predecessor ADE nao suportado: {current}")
    print(f"Atualizando ADE {current} -> {VERSION}")
    result = install(target=target, force=force, skip_runtime_check=skip_runtime_check)
    if result.get("package_version") != VERSION:
        raise ADEError("MIGRATION_FAILED: manifesto final divergente")
    print("MIGRATION_TO_V6_0_11_OK")
    print("Reinicie o OpenCode V2, abra uma sessao nova e rode validate.")
    return result
