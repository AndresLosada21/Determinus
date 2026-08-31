param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$c=Get-Content (Join-Path $Root 'plugin/capabilities.json') -Raw | ConvertFrom-Json
if(@($c.agents.PSObject.Properties).Count -ne 18){throw 'capability registry agents != 18'}
if(@($c.tools.PSObject.Properties).Count -ne 26){throw "capability registry tools != 26"}
$orch=@($c.agents.orchestrator)
if(($orch -join ',') -notmatch 'ade_status' -or ($orch -join ',') -notmatch 'ade_route_snapshot'){throw 'orchestrator compact tools ausentes'}
if($orch -contains 'ade_doctor' -or $orch -contains 'ade_state_get'){throw 'orchestrator happy-path surface excessiva'}
if(@($c.generation_max_tokens.PSObject.Properties).Count -ne 18){throw 'generation budgets != 18'}
$src=Get-Content (Join-Path $Root 'plugin/src/index.ts') -Raw
foreach($m in @('ctx.session.hook("context"','ctx.session.hook("retry"','event.generation.maxTokens','evidence.jsonl','telemetry.jsonl','ade_route_snapshot')){if($src -notmatch [regex]::Escape($m)){throw "marker ausente $m"}}
'PLUGIN_NATIVE_CONTRACT_OK'
