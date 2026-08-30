param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$validate=Get-Content (Join-Path $Root 'tooling/ade_tooling/validate.py') -Raw
$cli=Get-Content (Join-Path $Root 'tooling/ade_tooling/cli.py') -Raw
foreach($m in @('ADE_V5_RUNTIME_CORE_VALIDATED','BEHAVIORAL_EVALS_SKIPPED','BEHAVIORAL_EVALS_VALIDATED')){if(-not $validate.Contains($m)){throw "validate marker missing $m"}}
if(-not $cli.Contains('"--behavioral"')){throw '--behavioral flag missing'}
$smoke=Get-Content (Join-Path $Root 'tooling/ade_tooling/smoke.py') -Raw
if(-not $smoke.Contains('SUBAGENT_DEPTH_CONFIGURED: experimental.subagent_depth=2')){throw 'runtime config V2 marker missing'}
'RUNTIME_SMOKE_CLI_OK'
