param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$smoke=Get-Content (Join-Path $Root 'tooling/ade_tooling/smoke.py') -Raw
if($smoke -notmatch 'top-level subagent_depth.+legado/unsupported'){throw 'runtime não rejeita top-level legado'}
if($smoke -notmatch 'experimental\.subagent_depth'){throw 'runtime não exige experimental.subagent_depth'}
$config=Get-Content (Join-Path $Root 'opencode-fragment.jsonc') -Raw | ConvertFrom-Json
if([int]$config.experimental.subagent_depth -ne 2){throw 'fragment experimental.subagent_depth !=2'}
if($null -ne $config.subagent_depth){throw 'fragment contém top-level subagent_depth'}
'RUNTIME_CONFIG_GATE_OK'
