from __future__ import annotations

from pathlib import Path

from .common import package_root
from .regression import run_regression
from .validate import validate


def assurance(*, target: Path | None = None, model: str | None = None, source: bool = False, behavioral: bool = False) -> None:
    if source:
        run_regression(package_root())
        print("ADE_V5_SOURCE_PACKAGE_REGRESSION_VALIDATED")
    validate(target=target, model=model, behavioral=behavioral)
    if model:
        print("RELEASE_ASSURANCE_VALIDATED")
