from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator

VERSION = "6.1.3"
PLUGIN_ID = "ai-driven-engineering.native"
AGENTS = [
    "orchestrator","product-owner","project-manager","engineer","explorer","researcher",
    "modeler","engineering-planner","tester","implementer","verifier","debugger","reviewer",
    "security-reviewer","integrator","documenter","tracker-operator","vcs-operator",
]

class ADEError(RuntimeError):
    pass


def package_root() -> Path:
    return Path(__file__).resolve().parents[2]


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def source_tree_hash(root: Path, excludes: Iterable[str] = ("RELEASE.json",)) -> str:
    excluded = {x.replace("\\", "/") for x in excludes}
    runtime_parts = {".git", ".ai", "node_modules", "__pycache__", ".pytest_cache"}
    h = hashlib.sha256()
    files = []
    for x in root.rglob("*"):
        if not x.is_file():
            continue
        rel_path = x.relative_to(root)
        rel = rel_path.as_posix()
        if rel in excluded or any(part in runtime_parts for part in rel_path.parts) or x.suffix == ".pyc":
            continue
        files.append(x)
    for p in sorted(files, key=lambda x: x.relative_to(root).as_posix()):
        rel = p.relative_to(root).as_posix()
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(sha256_file(p).encode("ascii"))
        h.update(b"\n")
    return h.hexdigest()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def secure_mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != "nt":
        with contextlib.suppress(OSError):
            path.chmod(0o700)


def secure_file(path: Path) -> None:
    if os.name != "nt" and path.exists():
        with contextlib.suppress(OSError):
            path.chmod(0o600)


def write_text(path: Path, text: str) -> None:
    secure_mkdir(path.parent)
    tmp = path.parent / f".{path.name}.tmp-{os.getpid()}-{next(tempfile._get_candidate_names())}"
    try:
        with tmp.open("x", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        secure_file(tmp)
        os.replace(tmp, path)
        secure_file(path)
    finally:
        with contextlib.suppress(FileNotFoundError):
            tmp.unlink()


def load_json(path: Path, *, max_bytes: int = 2_000_000) -> Any:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise ADEError(f"JSON_READ_FAILED: {path}: {exc}") from exc
    if size > max_bytes:
        raise ADEError(f"JSON_TOO_LARGE: {path}: {size} bytes")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def copy_file_atomic(src: Path, dst: Path) -> str:
    if is_reparse(src):
        raise ADEError(f"COPY_UNSAFE_SOURCE: {src}")
    assert_safe_chain(dst.parent)
    secure_mkdir(dst.parent)
    tmp = dst.parent / f".{dst.name}.tmp-{os.getpid()}-{next(tempfile._get_candidate_names())}"
    try:
        with src.open("rb") as rf, tmp.open("xb") as wf:
            shutil.copyfileobj(rf, wf, length=1024 * 1024)
            wf.flush(); os.fsync(wf.fileno())
        secure_file(tmp)
        os.replace(tmp, dst)
        secure_file(dst)
    finally:
        with contextlib.suppress(FileNotFoundError): tmp.unlink()
    a, b = sha256_file(src), sha256_file(dst)
    if a != b:
        raise ADEError(f"COPY_VERIFY_FAILED: {src} -> {dst}")
    return b


def dump_json(path: Path, value: Any) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    write_text(path, text)


def strip_jsonc(text: str) -> str:
    out: list[str] = []
    i = 0
    in_string = False
    escape = False
    while i < len(text):
        ch = text[i]
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < len(text) and text[i + 1] == "/":
            i += 2
            while i < len(text) and text[i] not in "\r\n":
                i += 1
            continue
        if ch == "/" and i + 1 < len(text) and text[i + 1] == "*":
            i += 2
            while i + 1 < len(text) and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    cleaned = "".join(out)
    # remove trailing commas outside strings
    out2: list[str] = []
    i = 0
    in_string = False
    escape = False
    while i < len(cleaned):
        ch = cleaned[i]
        if in_string:
            out2.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out2.append(ch)
            i += 1
            continue
        if ch == ",":
            j = i + 1
            while j < len(cleaned) and cleaned[j].isspace():
                j += 1
            if j < len(cleaned) and cleaned[j] in "}]":
                i += 1
                continue
        out2.append(ch)
        i += 1
    return "".join(out2)


def jsonc_has_extended_syntax(text: str) -> bool:
    """True when comments or trailing commas would be lost by JSON serialization."""
    return strip_jsonc(text) != text


def load_jsonc(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(strip_jsonc(read_text(path)))
    except Exception as exc:
        raise ADEError(f"CONFIG_INVALID: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ADEError(f"CONFIG_INVALID: objeto raiz esperado em {path}")
    return data


def is_reparse(path: Path) -> bool:
    try:
        if path.is_symlink():
            return True
        st = path.lstat()
    except FileNotFoundError:
        return False
    attrs = getattr(st, "st_file_attributes", 0)
    flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return bool(attrs & flag)


def assert_safe_chain(path: Path) -> None:
    path = path.expanduser().absolute()
    current = path
    while True:
        if current.exists() and is_reparse(current):
            raise ADEError(f"UNSAFE_PATH: reparse/symlink detectado em {current}")
        parent = current.parent
        if parent == current:
            break
        current = parent


def assert_tree_no_links(root: Path) -> None:
    assert_safe_chain(root)
    if root.exists() and is_reparse(root):
        raise ADEError(f"UNSAFE_TREE: {root}")
    if root.exists():
        for p in root.rglob("*"):
            if is_reparse(p):
                raise ADEError(f"UNSAFE_TREE: link/reparse em {p}")


def safe_relative(rel: str) -> bool:
    if not rel or rel.startswith(("/", "\\")) or ":" in rel or any(c in rel for c in "*?[]"):
        return False
    parts = re.split(r"[\\/]", rel)
    return all(x not in ("", ".", "..") for x in parts)


def within(child: Path, parent: Path) -> bool:
    try:
        child.resolve(strict=False).relative_to(parent.resolve(strict=False))
        return True
    except ValueError:
        return False


def find_python() -> list[str]:
    return [sys.executable]


def find_opencode_cli() -> str | None:
    for name in ("opencode2", "opencode2.cmd", "opencode", "opencode.exe"):
        p = shutil.which(name)
        if p:
            return p
    return None


@dataclass
class CmdResult:
    code: int
    stdout: str
    stderr: str

    @property
    def combined(self) -> str:
        if self.stderr and self.stdout:
            return self.stdout + "\n" + self.stderr
        return self.stdout or self.stderr


def run_cmd(args: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None,
            timeout: int = 120, check: bool = False) -> CmdResult:
    p = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        shell=False,
    )
    result = CmdResult(p.returncode, p.stdout, p.stderr)
    if check and p.returncode != 0:
        raise ADEError(f"COMMAND_FAILED[{p.returncode}]: {' '.join(args)}\n{result.combined}")
    return result


def config_env(target: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["OPENCODE_CONFIG_DIR"] = str(target)
    return env


def parse_json_lines(text: str, label: str, *, require: bool = True) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except Exception as exc:
            raise ADEError(f"{label}: JSONL inválido na linha {number}: {exc}") from exc
        if isinstance(obj, dict):
            events.append(obj)
    if require and not events:
        raise ADEError(f"{label}: nenhum evento JSON")
    return events


def path_get(obj: Any, *parts: str, default: Any = None) -> Any:
    cur = obj
    for part in parts:
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def root_tool_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [e for e in events if e.get("type") == "tool_use" or path_get(e, "part", "type") == "tool"]


def root_texts(events: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for e in events:
        if path_get(e, "part", "type") == "text":
            text = path_get(e, "part", "text")
            if isinstance(text, str):
                out.append(text)
    return out


def export_session(cli: str, session_id: str, target: Path) -> dict[str, Any]:
    r = run_cmd([cli, "export", session_id], env=config_env(target), timeout=120)
    if r.code != 0:
        raise ADEError(f"SESSION_EXPORT_FAILED[{session_id}]: {r.combined}")
    try:
        obj = json.loads(r.stdout)
    except Exception as exc:
        raise ADEError(f"SESSION_EXPORT_INVALID[{session_id}]: {exc}") from exc
    if not isinstance(obj, dict):
        raise ADEError(f"SESSION_EXPORT_INVALID[{session_id}]: objeto esperado")
    return obj


def export_tool_records(export: dict[str, Any]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    out: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for msg in export.get("messages") or []:
        if not isinstance(msg, dict):
            continue
        for entry in msg.get("content") or []:
            if isinstance(entry, dict) and entry.get("type") == "tool":
                out.append((msg, entry))
    return out


def has_assistant_marker(export: dict[str, Any], agent: str, marker: str) -> bool:
    for msg in export.get("messages") or []:
        if not isinstance(msg, dict) or msg.get("type") != "assistant" or msg.get("agent") != agent:
            continue
        for entry in msg.get("content") or []:
            if isinstance(entry, dict) and entry.get("type") == "text" and isinstance(entry.get("text"), str):
                if entry["text"].strip() == marker:
                    return True
    return False


def assert_export_info(export: dict[str, Any], *, session_id: str, parent_id: str, agent: str, label: str) -> None:
    info = export.get("info")
    if not isinstance(info, dict):
        raise ADEError(f"{label}: info ausente")
    expected = {"id": session_id, "parentID": parent_id, "agent": agent, "outcome": "succeeded"}
    for k, v in expected.items():
        if str(info.get(k, "")) != v:
            raise ADEError(f"{label}: {k} esperado={v!r} atual={info.get(k)!r}")


def parse_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    text = read_text(path)
    if not text.startswith("---\n"):
        raise ADEError(f"FRONTMATTER_INVALID: {path}")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ADEError(f"FRONTMATTER_INVALID: {path}")
    front = text[4:end]
    body = text[end + 5:]
    result: dict[str, Any] = {"permissions": []}
    current_perm: dict[str, str] | None = None
    in_permissions = False
    for raw in front.splitlines():
        line = raw.rstrip()
        if re.match(r"^permissions:\s*$", line):
            in_permissions = True
            continue
        if in_permissions:
            m = re.match(r"^\s*-\s+action:\s*[\"']?([^\"']+?)[\"']?\s*$", line)
            if m:
                current_perm = {"action": m.group(1).strip()}
                result["permissions"].append(current_perm)
                continue
            m = re.match(r"^\s+(resource|effect):\s*[\"']?(.+?)[\"']?\s*$", line)
            if m and current_perm is not None:
                current_perm[m.group(1)] = m.group(2).strip().strip('"\'')
                continue
            if line and not line.startswith(" "):
                in_permissions = False
        if not in_permissions:
            m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*?)\s*$", line)
            if m:
                value = m.group(2).strip().strip('"\'')
                low = value.lower()
                if low == "true":
                    result[m.group(1)] = True
                elif low == "false":
                    result[m.group(1)] = False
                elif value.isdigit():
                    result[m.group(1)] = int(value)
                else:
                    result[m.group(1)] = value
    return result, body


def permissions_map(agent_file: Path) -> list[dict[str, str]]:
    return parse_frontmatter(agent_file)[0].get("permissions", [])


def allowed_actions(agent_file: Path, prefix: str | None = None) -> set[str]:
    allowed = {p.get("action", "") for p in permissions_map(agent_file) if p.get("effect") == "allow"}
    if prefix is not None:
        allowed = {x for x in allowed if x.startswith(prefix)}
    return allowed


def deny_all_present(agent_file: Path) -> bool:
    perms = permissions_map(agent_file)
    return any(p.get("action") == "*" and p.get("resource") == "*" and p.get("effect") == "deny" for p in perms)


def copy_file_verified(src: Path, dst: Path) -> str:
    value = copy_file_atomic(src, dst)
    if is_reparse(dst):
        raise ADEError(f"INSTALL_UNSAFE: destino virou reparse {dst}")
    return value


def iter_files(root: Path) -> Iterator[Path]:
    for p in sorted(root.rglob("*"), key=lambda x: x.relative_to(root).as_posix()):
        if p.is_file():
            yield p


def python_version_guard() -> None:
    if sys.version_info < (3, 9):
        raise ADEError("PYTHON_TOO_OLD: Python 3.9+ requerido")


def safe_rmtree_if_empty(path: Path, stop: Path) -> None:
    current = path
    while current != stop and within(current, stop):
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


@contextlib.contextmanager
def temporary_cwd(path: Path):
    old = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)
