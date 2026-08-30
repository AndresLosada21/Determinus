param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$src=Get-Content (Join-Path $Root 'plugin/src/index.ts') -Raw
foreach($m in @('normalizeEvidence','Array.isArray(value)','persistEvidence','evidence.jsonl','evidence_count','const limit=i.limit||5')){if(-not $src.Contains($m)){throw "evidence hardening ausente: $m"}}
$c=Get-Content (Join-Path $Root 'plugin/assets/project-templates/control.json') -Raw | ConvertFrom-Json
if([int]$c.schema_version -ne 3){throw 'control schema !=3'}
if($null -eq $c.evidence -or @($c.evidence).Count -ne 0){throw 'control evidence template deve iniciar []'}
'EVIDENCE_HARDENING_OK'
