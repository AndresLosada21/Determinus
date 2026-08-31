$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$smoke = [System.IO.File]::ReadAllText((Join-Path $root 'tooling/ade_tooling/smoke.py'))
$plugin = [System.IO.File]::ReadAllText((Join-Path $root 'plugin/src/index.ts'))
$cap = Get-Content -LiteralPath (Join-Path $root 'plugin/capabilities.json') -Raw | ConvertFrom-Json

foreach($required in @('ade_delegate','project-manager','tracker-operator','_smoke_handoffs','STRUCTURED_HANDOFF_BEHAVIOR_VALIDATED')) {
  if($smoke -notmatch [regex]::Escape($required)){throw "managed nested smoke marker missing: $required"}
}
if($smoke -match 'tool=="subagent"'){throw 'behavioral nested smoke ainda espera raw subagent'}
if($plugin -notmatch 'ADE_DELEGATION_NATIVE_BLOCKED'){throw 'runtime raw subagent deny missing'}
if($plugin -notmatch 'ctx\.session\.wait'){throw 'managed delegation wait missing'}
if(-not ($cap.agents.orchestrator -contains 'ade_delegate')){throw 'orchestrator sem ade_delegate'}
if(-not ($cap.agents.'project-manager' -contains 'ade_delegate')){throw 'project-manager sem ade_delegate'}
if(-not ($cap.hide_core_tools.orchestrator -contains 'subagent')){throw 'raw subagent não oculto do orchestrator'}
Write-Host 'Managed nested delegation smoke contract: OK'
