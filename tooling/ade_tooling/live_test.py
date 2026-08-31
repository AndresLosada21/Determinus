from __future__ import annotations

import contextlib
import io
import json
import os
import platform
import re
import shutil
import statistics
import sys
import tempfile
import time
import zipfile
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .common import ADEError, config_env, find_opencode_cli, load_json, run_cmd
from .manifest import validate_installed_manifest
from .smoke import (
    contract_runtime_smoke,
    kernel_analysis_smoke,
    kernel_approval_smoke,
    kernel_proposal_smoke,
    plugin_runtime_smoke,
    runtime_config_smoke,
)

# Curated against the OpenCode Zen catalog documented on 2026-08-30.
# Availability is still probed from the local OpenCode catalog before execution.
DEFAULT_ZEN_FREE_MODELS = [
    "opencode/muse-spark-1.2-contributor-free",
    "opencode/mimo-v2.5-free",
    "opencode/ling-3.0-flash-fin-free",
    "opencode/nemotron-3-ultra-free",
    "opencode/nemotron-3.5-lightning-free",
]

SCENARIOS: dict[str, Callable[[Path, str], None]] = {
    "kernel-analysis": kernel_analysis_smoke,
    "approval-boundary": kernel_approval_smoke,
    "worker-lifecycle": kernel_proposal_smoke,
}

_SECRET_PATTERNS = [
    (re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[^\s]+"), r"\1<redacted>"),
    (re.compile(r"(?i)(api[_-]?key\s*[=:]\s*)[^\s,;]+"), r"\1<redacted>"),
    (re.compile(r"(?i)(token\s*[=:]\s*)[^\s,;]+"), r"\1<redacted>"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"), "<redacted-github-token>"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), "<redacted-api-key>"),
]


def _redact(text: str) -> str:
    out = text
    for pattern, repl in _SECRET_PATTERNS:
        out = pattern.sub(repl, out)
    return out


def _now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _safe_slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_")[:120]


def _classify_failure(message: str) -> str:
    low = message.lower()
    if "model" in low and any(x in low for x in ("not found", "unknown", "unavailable", "resolve")):
        return "MODEL_UNAVAILABLE"
    if any(x in low for x in ("tool_choice", "reasoning item expired", "provider.invalid-request", "invalid_request_error")):
        return "PROVIDER_OR_OPENCODE_RUNTIME"
    if "subagent status=error" in low or "subagent:error" in low:
        return "PROVIDER_OR_OPENCODE_RUNTIME"
    if "timeout" in low or "timed out" in low:
        return "PROVIDER_OR_OPENCODE_RUNTIME"
    if any(x in low for x in ("tools extras", "handoff", "subagents=", "owner=", "resposta verbosa", "expected", "esperado")):
        return "AGENT_BEHAVIOR"
    if "plugin" in low or "contract_assurance" in low:
        return "ADE_RUNTIME"
    return "UNKNOWN"


def _capture(fn: Callable[[], None]) -> tuple[bool, str, str | None, float]:
    buf = io.StringIO()
    started = time.perf_counter()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            fn()
        return True, _redact(buf.getvalue()), None, time.perf_counter() - started
    except Exception as exc:  # deliberate: evidence runner must record unexpected host errors too
        msg = f"{type(exc).__name__}: {exc}"
        return False, _redact(buf.getvalue()), _redact(msg), time.perf_counter() - started


def _catalog(cli: str, target: Path) -> tuple[set[str], str]:
    # V2 exposes the same automation-friendly model catalog command. If a beta build
    # does not, the per-model runtime probe remains authoritative.
    r = run_cmd([cli, "models"], env=config_env(target), timeout=90)
    text = _redact(r.combined)
    if r.code != 0:
        return set(), text
    found: set[str] = set()
    for raw in r.stdout.splitlines():
        line = raw.strip().split()[0] if raw.strip() else ""
        if "/" in line and not line.startswith(("http://", "https://")):
            found.add(line)
    return found, text


def _health(cli: str, target: Path) -> dict[str, Any]:
    r = run_cmd([cli, "api", "get", "/api/health"], env=config_env(target), timeout=45)
    if r.code != 0:
        return {"ok": False, "error": _redact(r.combined)}
    try:
        payload = json.loads(r.stdout)
        if isinstance(payload, dict):
            return {"ok": True, **payload}
    except Exception:
        pass
    return {"ok": True, "raw": _redact(r.stdout.strip())}


@dataclass
class TrialResult:
    model: str
    scenario: str
    trial: int
    passed: bool
    duration_s: float
    failure_domain: str | None
    error: str | None
    log_file: str


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        "# ADE Live Integration Matrix",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- ADE: `{report.get('ade_version', 'unknown')}`",
        f"- OpenCode health/version: `{report.get('opencode', {}).get('version', 'unknown')}`",
        f"- Trials per scenario: `{report['trials']}`",
        f"- Strict: `{str(report['strict']).lower()}`",
        "",
        "## Model matrix",
        "",
        "| Model | Probe | Analysis | Approval | Worker lifecycle | Total | Mean latency |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for model in report["models"]:
        m = report["results"][model]
        def cell(name: str) -> str:
            s = m["scenarios"].get(name) or {}
            return f"{s.get('passed', 0)}/{s.get('executed', 0)}"
        lines.append(
            f"| `{model}` | {m['probe']} | {cell('kernel-analysis')} | {cell('approval-boundary')} | "
            f"{cell('worker-lifecycle')} | {m['passed']}/{m['executed']} | {m['mean_duration_s']:.1f}s |"
        )
    lines += ["", "## Failure domains", ""]
    if report["failure_domains"]:
        for k, v in sorted(report["failure_domains"].items()):
            lines.append(f"- `{k}`: {v}")
    else:
        lines.append("- none")
    lines += [
        "",
        "## Interpretation",
        "",
        "Each behavioral trial uses strict ADE v6 durable-kernel canary assertions. The matrix never converts a failed trial into success. "
        "A pass rate is a reliability measurement, not a relaxed acceptance criterion.",
        "",
        "`MODEL_UNAVAILABLE` is reported as unavailable and is not counted as a passing trial. Logs are redacted before being written.",
    ]
    return "\n".join(lines) + "\n"


def live_test(
    *,
    target: Path,
    models: list[str] | None = None,
    trials: int = 3,
    scenarios: list[str] | None = None,
    output_dir: Path | None = None,
    strict: bool = False,
    skip_core: bool = False,
    bundle: bool = True,
) -> dict[str, Any]:
    if trials < 1 or trials > 20:
        raise ADEError(f"LIVE_TEST_INVALID_TRIALS: {trials}; esperado 1..20")
    requested = models or list(DEFAULT_ZEN_FREE_MODELS)
    if not requested:
        raise ADEError("LIVE_TEST_NO_MODELS")
    selected_scenarios = scenarios or list(SCENARIOS)
    unknown = [x for x in selected_scenarios if x not in SCENARIOS]
    if unknown:
        raise ADEError(f"LIVE_TEST_UNKNOWN_SCENARIOS: {unknown}")
    cli = find_opencode_cli()
    if not cli:
        raise ADEError("LIVE_TEST_BLOCKED: OpenCode CLI não encontrado")

    out = (output_dir or (Path.cwd() / "ade-live-results" / _now_stamp())).expanduser().absolute()
    logs = out / "logs"
    logs.mkdir(parents=True, exist_ok=False)

    report: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": str(target),
        "host": {"platform": platform.platform(), "python": sys.version.split()[0], "cli": cli},
        "opencode": _health(cli, target),
        "models": requested,
        "trials": trials,
        "scenarios": selected_scenarios,
        "strict": strict,
        "results": {},
        "failure_domains": {},
        "core": {"executed": not skip_core, "passed": None},
    }

    try:
        manifest = load_json(target / "ai-driven-engineering-install.json")
        report["ade_version"] = manifest.get("package_version")
    except Exception:
        report["ade_version"] = "unknown"

    catalog, catalog_raw = _catalog(cli, target)
    report["catalog_probe"] = {"count": len(catalog), "available": sorted(catalog)}
    (out / "catalog.txt").write_text(catalog_raw, encoding="utf-8", newline="\n")

    if not skip_core:
        ok, log, err, duration = _capture(lambda: (
            validate_installed_manifest(target),
            runtime_config_smoke(target),
            contract_runtime_smoke(target),
        ))
        (logs / "core-contract.log").write_text(log + (f"\nERROR: {err}\n" if err else ""), encoding="utf-8", newline="\n")
        report["core"] = {"executed": True, "passed": ok, "duration_s": round(duration, 3), "error": err}
        if not ok:
            _write_reports(out, report, bundle=bundle)
            raise ADEError(f"LIVE_TEST_CORE_FAILED: {err}")

    all_trials: list[TrialResult] = []
    for model in requested:
        mslug = _safe_slug(model)
        mdir = logs / mslug
        mdir.mkdir()
        mresult: dict[str, Any] = {"probe": "PENDING", "scenarios": {}, "passed": 0, "failed": 0, "executed": 0, "mean_duration_s": 0.0}
        report["results"][model] = mresult

        # Catalog visibility is informative because beta builds/caches can diverge.
        catalog_visible = not catalog or model in catalog
        mresult["catalog_visible"] = catalog_visible

        ok, log, err, duration = _capture(lambda model=model: plugin_runtime_smoke(target, model=model))
        (mdir / "probe.log").write_text(log + (f"\nERROR: {err}\n" if err else ""), encoding="utf-8", newline="\n")
        if not ok:
            domain = _classify_failure(err or log)
            mresult["probe"] = "UNAVAILABLE" if domain == "MODEL_UNAVAILABLE" else "FAIL"
            mresult["probe_error"] = err
            mresult["probe_failure_domain"] = domain
            report["failure_domains"][domain] = report["failure_domains"].get(domain, 0) + 1
            # A failed model probe makes behavioral trials meaningless for this model.
            continue
        mresult["probe"] = "PASS"
        mresult["probe_duration_s"] = round(duration, 3)

        durations: list[float] = []
        for scenario in selected_scenarios:
            fn = SCENARIOS[scenario]
            sresult = {"passed": 0, "failed": 0, "executed": 0, "pass_rate": 0.0, "mean_duration_s": 0.0}
            mresult["scenarios"][scenario] = sresult
            sdurs: list[float] = []
            for trial in range(1, trials + 1):
                ok, tlog, err, elapsed = _capture(lambda fn=fn, model=model: fn(target, model))
                log_rel = f"logs/{mslug}/{scenario}-trial-{trial:02d}.log"
                (out / log_rel).write_text(tlog + (f"\nERROR: {err}\n" if err else ""), encoding="utf-8", newline="\n")
                domain = None if ok else _classify_failure(err or tlog)
                tr = TrialResult(model, scenario, trial, ok, round(elapsed, 3), domain, err, log_rel)
                all_trials.append(tr)
                sresult["executed"] += 1
                mresult["executed"] += 1
                durations.append(elapsed); sdurs.append(elapsed)
                if ok:
                    sresult["passed"] += 1; mresult["passed"] += 1
                    print(f"LIVE_TRIAL PASS model={model} scenario={scenario} trial={trial}/{trials} duration={elapsed:.1f}s")
                else:
                    sresult["failed"] += 1; mresult["failed"] += 1
                    report["failure_domains"][domain] = report["failure_domains"].get(domain, 0) + 1
                    print(f"LIVE_TRIAL FAIL model={model} scenario={scenario} trial={trial}/{trials} domain={domain} duration={elapsed:.1f}s")
            sresult["pass_rate"] = sresult["passed"] / sresult["executed"] if sresult["executed"] else 0.0
            sresult["mean_duration_s"] = round(statistics.mean(sdurs), 3) if sdurs else 0.0
        mresult["mean_duration_s"] = round(statistics.mean(durations), 3) if durations else 0.0

    report["trial_results"] = [asdict(x) for x in all_trials]
    report["summary"] = {
        "passed": sum(x.passed for x in all_trials),
        "failed": sum(not x.passed for x in all_trials),
        "executed": len(all_trials),
        "pass_rate": (sum(x.passed for x in all_trials) / len(all_trials)) if all_trials else 0.0,
        "models_probe_passed": sum(1 for x in report["results"].values() if x["probe"] == "PASS"),
        "models_probe_failed": sum(1 for x in report["results"].values() if x["probe"] != "PASS"),
    }
    paths = _write_reports(out, report, bundle=bundle)
    report["artifacts"] = paths

    print(f"LIVE_MATRIX_REPORT_JSON: {paths['json']}")
    print(f"LIVE_MATRIX_REPORT_MD: {paths['markdown']}")
    if paths.get("bundle"):
        print(f"LIVE_MATRIX_EVIDENCE_BUNDLE: {paths['bundle']}")
    print(
        "LIVE_MATRIX_SUMMARY: "
        f"passed={report['summary']['passed']}/{report['summary']['executed']} "
        f"pass_rate={report['summary']['pass_rate']:.0%} "
        f"models_probe_passed={report['summary']['models_probe_passed']}/{len(requested)}"
    )

    if strict:
        failed_trials = report["summary"]["failed"]
        failed_probes = report["summary"]["models_probe_failed"]
        if failed_trials or failed_probes or not report["summary"]["executed"]:
            raise ADEError(
                f"LIVE_MATRIX_STRICT_FAILED: trial_failures={failed_trials} "
                f"model_probe_failures={failed_probes}"
            )
        print("LIVE_MATRIX_STRICT_VALIDATED")
    return report


def _write_reports(out: Path, report: dict[str, Any], *, bundle: bool) -> dict[str, str]:
    json_path = out / "report.json"
    md_path = out / "report.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    md_path.write_text(_markdown(report), encoding="utf-8", newline="\n")
    paths = {"directory": str(out), "json": str(json_path), "markdown": str(md_path)}
    if bundle:
        zip_path = out.parent / f"{out.name}-evidence.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for p in sorted(out.rglob("*")):
                if p.is_file():
                    zf.write(p, p.relative_to(out).as_posix())
        paths["bundle"] = str(zip_path)
    return paths
