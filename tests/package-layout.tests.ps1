param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$required=@('VERSION','README.md','VALIDATION.md','AGENTS.managed.md','opencode-fragment.jsonc','plugin/capabilities.json','plugin/src/index.ts','tooling/ade.py')
foreach($rel in $required){ if(-not (Test-Path (Join-Path $Root $rel))){ throw "missing $rel" } }
$agents=@(Get-ChildItem (Join-Path $Root 'agents') -Filter '*.md' -File)
if($agents.Count -ne 18){ throw "agents != 18: $($agents.Count)" }
$config=Get-Content (Join-Path $Root 'opencode-fragment.jsonc') -Raw
if($config -notmatch '"default_agent"\s*:\s*"orchestrator"'){throw 'default_agent ausente'}
if($config -notmatch '"experimental"[\s\S]*"subagent_depth"\s*:\s*2'){throw 'experimental.subagent_depth=2 ausente'}
if($config -match '(?m)^\s{2}"subagent_depth"\s*:'){throw 'top-level subagent_depth legado presente'}
foreach($a in $agents){$raw=Get-Content $a.FullName -Raw;if($raw -match '(?m)^subagent_depth\s*:'){throw "$($a.Name): per-agent subagent_depth presente"}}
'PACKAGE_LAYOUT_OK'
