from __future__ import annotations

from pathlib import Path

from .common import ADEError, VERSION
from .manifest import validate_installed_manifest
from .smoke import capability_recovery_smoke, engineering_recovery_routing_smoke, nested_delegation_smoke, plugin_runtime_smoke, runtime_config_smoke


def validate(*, target: Path | None = None, model: str | None = None, behavioral: bool = False) -> None:
    target = (target or (Path.home()/".config"/"opencode")).expanduser().absolute()
    validate_installed_manifest(target)
    plugin_runtime_smoke(target, model=model)
    runtime_config_smoke(target)
    if not model:
        if behavioral:
            raise ADEError("BEHAVIORAL_EVAL_REQUIRES_MODEL: forneça --model provider/model")
        print("ADE_V5_STRUCTURAL_ASSURANCE_OK")
        print("RUNTIME_PROVIDER_VALIDATION_PENDING: forneça --model para provar provider + tool execution.")
        return
    print("ADE_V5_RUNTIME_CORE_VALIDATED")
    print(f"RUNTIME_VALIDATED: {VERSION}")
    if not behavioral:
        print("BEHAVIORAL_EVALS_SKIPPED: use --behavioral para nesting/routing/model-compliance evals.")
        return
    nested_delegation_smoke(target, model)
    capability_recovery_smoke(target, model)
    engineering_recovery_routing_smoke(target, model)
    print("BEHAVIORAL_EVALS_VALIDATED")
