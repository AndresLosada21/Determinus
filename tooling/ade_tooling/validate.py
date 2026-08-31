from __future__ import annotations

from pathlib import Path

from .common import ADEError, VERSION
from .manifest import validate_installed_manifest
from .smoke import contract_runtime_smoke, kernel_analysis_smoke, kernel_approval_smoke, kernel_proposal_smoke, plugin_runtime_smoke, runtime_config_smoke


def validate(*, target: Path | None = None, model: str | None = None, behavioral: bool = False) -> None:
    target=(target or (Path.home()/".config"/"opencode")).expanduser().absolute()
    validate_installed_manifest(target)
    plugin_runtime_smoke(target,model=model)
    runtime_config_smoke(target)
    contract_runtime_smoke(target)
    if not model:
        if behavioral:raise ADEError("BEHAVIORAL_EVAL_REQUIRES_MODEL: provide --model provider/model")
        print("ADE_V6_STRUCTURAL_ASSURANCE_OK")
        print("LIVE_TUI_PROJECTION_CANARY_PENDING: structural validation cannot certify parent-visible streaming")
        print("RUNTIME_PROVIDER_VALIDATION_PENDING: provide --model for provider + real tool execution")
        return
    print("ADE_V6_RUNTIME_CORE_VALIDATED")
    print(f"RUNTIME_VALIDATED: {VERSION}")
    if not behavioral:
        print("BEHAVIORAL_CANARY_PENDING: core+contract validated; durable workflow canaries are opt-in")
        print("RELEASE_ASSURANCE_PENDING: real host/provider workflow behavior not yet certified")
        return
    kernel_analysis_smoke(target,model)
    kernel_approval_smoke(target,model)
    kernel_proposal_smoke(target,model)
    print("V6_BEHAVIORAL_EVALS_VALIDATED")
    print("LIVE_TUI_PROJECTION_CANARY_PENDING: verify child/progress rendering interactively on the OpenCode TUI")
