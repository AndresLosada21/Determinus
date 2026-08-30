from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .assurance import assurance
from .common import ADEError, VERSION, python_version_guard
from .install import install
from .manifest import validate_installed_manifest
from .migrate import migrate
from .policy import static_policy
from .regression import run_regression
from .smoke import behavioral_reliability_report, capability_recovery_smoke, contract_runtime_smoke, engineering_recovery_routing_smoke, nested_delegation_smoke, plugin_runtime_smoke, runtime_config_smoke
from .uninstall import uninstall
from .validate import validate


def _target(value: str | None) -> Path | None:
    return Path(value).expanduser().absolute() if value else None


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ade", description="AI-Driven Engineering v5.2.3 state-driven runtime tooling")
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("regression")
    r.add_argument("--package-root")
    r.add_argument("--json", action="store_true")

    s = sub.add_parser("static-policy")
    s.add_argument("--package-root")

    i = sub.add_parser("install")
    i.add_argument("--target")
    i.add_argument("--force", action="store_true")
    i.add_argument("--no-default-agent", action="store_true")
    i.add_argument("--no-config-patch", action="store_true")
    i.add_argument("--no-ambient-instructions", action="store_true")
    i.add_argument("--skip-runtime-check", action="store_true")
    i.add_argument("--skip-regression", action="store_true")

    m = sub.add_parser("migrate")
    m.add_argument("--target")
    m.add_argument("--force", action="store_true")
    m.add_argument("--skip-runtime-check", action="store_true")

    u = sub.add_parser("uninstall")
    u.add_argument("--target")

    v = sub.add_parser("validate")
    v.add_argument("--target")
    v.add_argument("--model")
    v.add_argument("--behavioral", action="store_true")

    a = sub.add_parser("assurance")
    a.add_argument("--target")
    a.add_argument("--model")
    a.add_argument("--source", action="store_true")
    a.add_argument("--behavioral", action="store_true", help="compatibilidade; assurance com --model já executa behavioral por padrão")
    a.add_argument("--core-only", action="store_true", help="não execute behavioral canary; release assurance não será alegada")

    mc = sub.add_parser("manifest-check")
    mc.add_argument("--target")

    ps = sub.add_parser("plugin-smoke")
    ps.add_argument("--target")
    ps.add_argument("--model")
    rs = sub.add_parser("runtime-smoke")
    rs.add_argument("--target")
    nd = sub.add_parser("nested-smoke")
    nd.add_argument("--target"); nd.add_argument("--model", required=True)
    cr = sub.add_parser("capability-smoke")
    cr.add_argument("--target"); cr.add_argument("--model", required=True)
    er = sub.add_parser("engineering-recovery-smoke")
    er.add_argument("--target"); er.add_argument("--model", required=True)
    cs = sub.add_parser("contract-smoke")
    cs.add_argument("--target")
    br = sub.add_parser("behavioral-reliability")
    br.add_argument("--target"); br.add_argument("--model", required=True)
    br.add_argument("--trials", type=int, default=5)
    br.add_argument("--strict", action="store_true", help="falha se qualquer trial estrito falhar")
    return p


def main(argv: list[str] | None = None) -> int:
    python_version_guard()
    args = parser().parse_args(argv)
    try:
        if args.command == "regression":
            run_regression(Path(args.package_root).absolute() if args.package_root else None, json_output=args.json)
        elif args.command == "static-policy":
            static_policy(Path(args.package_root).absolute() if args.package_root else None); print("STATIC_POLICY_OK")
        elif args.command == "install":
            install(target=_target(args.target), force=args.force, no_default_agent=args.no_default_agent,
                    no_config_patch=args.no_config_patch, no_ambient_instructions=args.no_ambient_instructions,
                    skip_runtime_check=args.skip_runtime_check, skip_regression=args.skip_regression)
        elif args.command == "migrate":
            migrate(target=_target(args.target), force=args.force, skip_runtime_check=args.skip_runtime_check)
        elif args.command == "uninstall":
            uninstall(target=_target(args.target))
        elif args.command == "validate":
            validate(target=_target(args.target), model=args.model, behavioral=args.behavioral)
        elif args.command == "assurance":
            assurance(target=_target(args.target), model=args.model, source=args.source, behavioral=True, core_only=args.core_only)
        elif args.command == "manifest-check":
            validate_installed_manifest(_target(args.target) or (Path.home()/".config"/"opencode"))
        elif args.command == "plugin-smoke":
            plugin_runtime_smoke(_target(args.target) or (Path.home()/".config"/"opencode"), model=args.model)
        elif args.command == "runtime-smoke":
            runtime_config_smoke(_target(args.target) or (Path.home()/".config"/"opencode"))
        elif args.command == "nested-smoke":
            nested_delegation_smoke(_target(args.target) or (Path.home()/".config"/"opencode"), args.model)
        elif args.command == "capability-smoke":
            capability_recovery_smoke(_target(args.target) or (Path.home()/".config"/"opencode"), args.model)
        elif args.command == "engineering-recovery-smoke":
            engineering_recovery_routing_smoke(_target(args.target) or (Path.home()/".config"/"opencode"), args.model)
        elif args.command == "contract-smoke":
            contract_runtime_smoke(_target(args.target) or (Path.home()/".config"/"opencode"))
        elif args.command == "behavioral-reliability":
            behavioral_reliability_report(_target(args.target) or (Path.home()/".config"/"opencode"), args.model, trials=args.trials, strict=args.strict)
        return 0
    except ADEError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130

if __name__ == "__main__":
    raise SystemExit(main())
