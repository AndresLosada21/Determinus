param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
# V5.2 follows OpenCode V2 canonical experimental.subagent_depth only.
$config=Get-Content (Join-Path $Root 'opencode-fragment.jsonc') -Raw | ConvertFrom-Json
if([int]$config.experimental.subagent_depth -ne 2){throw 'experimental.subagent_depth !=2'}
if($null -ne $config.subagent_depth){throw 'top-level subagent_depth should be absent'}
foreach($f in Get-ChildItem (Join-Path $Root 'agents') -Filter '*.md' -File){
  $raw=Get-Content $f.FullName -Raw
  if($raw -match '(?m)^subagent_depth\s*:'){throw "$($f.Name): per-agent subagent_depth unsupported"}
}
$install=Get-Content (Join-Path $Root 'tooling/ade_tooling/install.py') -Raw
foreach($m in @('cfg.pop("subagent_depth", None)','exp["subagent_depth"] = 2','"subagent_depth_mode": "experimental-v2"')){if(-not $install.Contains($m)){throw "installer V2 marker missing: $m"}}
'SUBAGENT_DEPTH_V2_COMPAT_OK'
