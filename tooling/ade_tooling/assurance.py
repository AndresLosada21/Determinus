from __future__ import annotations

from pathlib import Path

from .common import package_root
from .regression import run_regression
from .validate import validate


def assurance(*, target: Path | None = None, model: str | None = None, source: bool = False, behavioral: bool = True, core_only: bool = False) -> None:
    if source:
        run_regression(package_root())
        print("ADE_V5_SOURCE_PACKAGE_REGRESSION_VALIDATED")
    effective_behavioral = bool(model) and behavioral and not core_only
    validate(target=target, model=model, behavioral=effective_behavioral)
    if model and effective_behavioral:
        print("RELEASE_ASSURANCE_VALIDATED: core + contract + behavioral canary")
    elif model:
        print("RELEASE_ASSURANCE_NOT_CLAIMED: --core-only não certifica comportamento dos agents")
