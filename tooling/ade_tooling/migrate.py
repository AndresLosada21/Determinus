from __future__ import annotations

from pathlib import Path

from .common import ADEError, VERSION, assert_safe_chain, is_reparse, load_json
from .install import install

PATCH_SOURCES = {"6.0.0", "6.0.1", "6.0.2", "6.0.3", "6.0.4", "6.0.5", "6.0.6", "6.0.7", "6.0.8", "6.0.9", "6.0.10"}
MAJOR_DIRECT_SOURCE = "5.2.8"


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
    if current not in PATCH_SOURCES and not (current.startswith("4.") or current.startswith("5.")):
        raise ADEError(f"MIGRATION_BLOCKED: esperado ADE 6.0.0..6.0.10 ou v4.x/v5.x (major direto recomendado 5.2.8); atual={current}")
    if current in PATCH_SOURCES:
        print(f"Atualizando ADE {current} -> {VERSION} (durable runtime patch)")
    else:
        print(f"Migrando ADE {current} -> {VERSION} (major replacement: durable kernel)")
    result = install(target=target, force=force, skip_runtime_check=skip_runtime_check)
    if result.get("package_version") != VERSION:
        raise ADEError("MIGRATION_FAILED: manifesto final divergente")
    print("MIGRATION_TO_V6_0_11_OK")
    print("Reinicie o OpenCode V2, abra sessão nova e rode validate. Projetos v5 são importados como legacy snapshot não autoritativo no primeiro uso v6.")
    return result
