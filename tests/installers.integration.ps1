param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$python=(Get-Command python -ErrorAction SilentlyContinue);if(-not $python){$python=(Get-Command py -ErrorAction Stop)}
$temp=Join-Path ([IO.Path]::GetTempPath()) ("ade-v520-install-"+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  @'
{
  "$schema": "https://opencode.ai/config.json",
  "subagent_depth": 1,
  "experimental": { "subagent_depth": 1, "other_flag": true },
  "theme": "system"
}
'@ | Set-Content (Join-Path $temp 'opencode.json') -Encoding UTF8
  & $python.Source -B (Join-Path $Root 'tooling/ade.py') install --target $temp --skip-runtime-check --skip-regression | Out-Host
  if($LASTEXITCODE -ne 0){throw "install exit=$LASTEXITCODE"}
  $cfg=Get-Content (Join-Path $temp 'opencode.json') -Raw | ConvertFrom-Json
  if($null -ne $cfg.subagent_depth){throw 'legacy top-level subagent_depth not removed'}
  if([int]$cfg.experimental.subagent_depth -ne 2){throw 'experimental.subagent_depth !=2'}
  if($cfg.experimental.other_flag -ne $true){throw 'unrelated experimental setting lost'}
  if($cfg.default_agent -ne 'orchestrator'){throw 'default_agent not set'}
  $m=Get-Content (Join-Path $temp 'ai-driven-engineering-install.json') -Raw | ConvertFrom-Json
  if([int]$m.schema_version -ne 7){throw 'manifest schema !=7'}
  if($m.package_version -ne '5.2.5'){throw 'package version !=5.2.5'}
  if($m.config.subagent_depth_mode -ne 'experimental-v2'){throw 'manifest depth mode wrong'}
  & $python.Source -B (Join-Path $temp 'ai-driven-engineering/tooling/ade.py') manifest-check --target $temp | Out-Host
  if($LASTEXITCODE -ne 0){throw 'manifest check failed'}
  'INSTALLERS_INTEGRATION_OK'
} finally { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }
