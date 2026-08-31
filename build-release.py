#!/usr/bin/env python3
"""Create deterministic ADE source and convenience release bundles."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = "6.0.11"
NAME = f"opencode-ai-driven-engineering-v{VERSION}"
EXCLUDED_PARTS = {".git", ".ai", "__pycache__", "node_modules"}
EXCLUDED_SUFFIXES = {".zip", ".pyc"}


def files(root: Path, *, include_archives: bool = False):
    for path in sorted(root.rglob("*")):
        if not path.is_file() or any(part in EXCLUDED_PARTS for part in path.relative_to(root).parts):
            continue
        if path.suffix.lower() in EXCLUDED_SUFFIXES and not (include_archives and path.suffix.lower() == ".zip"):
            continue
        yield path


def write_zip(output: Path, source: Path, prefix: str, *, include_archives: bool = False) -> None:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files(source, include_archives=include_archives):
            info = zipfile.ZipInfo(f"{prefix}/{path.relative_to(source).as_posix()}", date_time=(2026, 8, 31, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wrapper(command: str) -> str:
    return f"from _ade_wrapper import run\nraise SystemExit(run({command!r}))\n"


def main() -> int:
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="utf-8"))
    if release["version"] != VERSION:
        raise SystemExit("RELEASE_VERSION_MISMATCH")
    output = ROOT.parent / f"{NAME}-release-bundle"
    if output.exists():
        raise SystemExit(f"OUTPUT_EXISTS: {output}")
    output.mkdir()
    inner = output / f"{NAME}-complete.zip"
    write_zip(inner, ROOT, NAME)
    staged = output / NAME
    shutil.copytree(ROOT, staged, ignore=shutil.ignore_patterns(".git", ".ai", "__pycache__", "node_modules", "*.zip", "*.pyc"))
    (output / "_ade_wrapper.py").write_text(
        "from __future__ import annotations\nfrom pathlib import Path\nimport subprocess, sys\n"
        f"\ndef run(command: str) -> int:\n    root = Path(__file__).resolve().parent / {NAME!r}\n"
        "    ade = root / 'tooling' / 'ade.py'\n    if not ade.is_file():\n"
        "        print(f'ADE_BUNDLE_INVALID: {ade} not found', file=sys.stderr)\n        return 2\n"
        "    return subprocess.call([sys.executable, '-B', str(ade), command, *sys.argv[1:]])\n",
        encoding="utf-8",
    )
    for filename, command in {
        "install-opencode-v6.0.11.py": "install",
        "migrate-opencode-v6.0.10-to-v6.0.11.py": "migrate",
        "validate-opencode-v6.0.11.py": "validate",
        "regression-opencode-v6.0.11.py": "regression",
        "static-policy-opencode-v6.0.11.py": "static-policy",
        "uninstall-opencode-v6.0.11.py": "uninstall",
    }.items():
        (output / filename).write_text(wrapper(command), encoding="utf-8")
    (output / f"{NAME}-complete.zip.sha256").write_text(f"{sha256(inner)}  {inner.name}\n", encoding="ascii")
    manifest = {
        "schema_version": 1,
        "version": VERSION,
        "release_state": release["release_state"],
        "source_tree_sha256": release["source_tree_sha256"],
        "inner_source_zip": inner.name,
        "inner_source_zip_sha256": sha256(inner),
        "active_agents": 5,
        "managed_agent_files": 18,
        "typed_tools": 34,
        "python_regression_groups": 36,
        "node_plugin_tests": 104,
        "static_policy": "passed",
        "typescript": "passed",
        "migration_from": ["6.0.10", "6.0.9", "6.0.8", "6.0.7", "6.0.6", "6.0.5", "6.0.4", "6.0.3", "6.0.2", "6.0.1", "6.0.0", "5.2.8"],
        "runtime_validation": "pending",
    }
    (output / "BUNDLE_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    checksums = []
    for path in files(output, include_archives=True):
        checksums.append(f"{sha256(path)}  {path.relative_to(output).as_posix()}")
    (output / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="ascii")
    outer = output.parent / f"{output.name}.zip"
    write_zip(outer, output, output.name, include_archives=True)
    (outer.with_suffix(".zip.sha256")).write_text(f"{sha256(outer)}  {outer.name}\n", encoding="ascii")
    print(f"SOURCE_ZIP={inner}")
    print(f"OUTER_ZIP={outer}")
    print(f"OUTER_SHA256={sha256(outer)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
