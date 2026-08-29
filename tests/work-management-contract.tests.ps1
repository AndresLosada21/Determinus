$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$pm = [System.IO.File]::ReadAllText((Join-Path $root 'agents/project-manager.md'))
$tracker = [System.IO.File]::ReadAllText((Join-Path $root 'agents/tracker-operator.md'))
$runtime = [System.IO.File]::ReadAllText((Join-Path $root 'runtime/work-management.ps1'))
$integration = Get-Content -LiteralPath (Join-Path $root 'skills/ai-driven-engineering/templates/integrations.json') -Raw | ConvertFrom-Json

if ($pm -notmatch 'resource:\s+"tracker-operator"[\s\S]{0,80}effect:\s+allow') { throw 'PM não pode invocar tracker-operator' }
if ($pm -notmatch 'TRACKER_AUTHORITY: EXECUTION_ONLY') { throw 'PM não explicita authority execution-only do tracker' }
if ($tracker -notmatch 'mode:\s+subagent') { throw 'tracker-operator deve ser subagent' }
if ($tracker -match 'action:\s+edit[\s\S]{0,100}effect:\s+allow') { throw 'tracker-operator não deve editar diretamente' }
if ($runtime -notmatch '"github"') { throw 'provider github ausente' }
if ($runtime -notmatch '"jira"') { throw 'provider jira ausente' }
if ($runtime -notmatch '"linear"') { throw 'provider linear ausente' }
if ($runtime -notmatch 'external_done_requires_global_done') { throw 'gate de external done ausente' }
if ($runtime -notmatch 'globalStatus -ne "DONE"') { throw 'external terminal status não depende de Global DONE' }
if ($runtime -match 'show-token') { throw 'runtime não deve solicitar exibição de token GitHub' }

$rawTemplate = [System.IO.File]::ReadAllText((Join-Path $root 'skills/ai-driven-engineering/templates/integrations.json'))
$secretPatterns = @(
    ('gh' + 'p_'),
    ('github' + '_pat_'),
    ('Bearer ' + 'ey'),
    ('api_' + 'token_value'),
    ('LINEAR_API_KEY' + '": "')
)
foreach ($secretName in $secretPatterns) {
    if ($rawTemplate -match [regex]::Escape($secretName)) { throw "template parece conter secret material: $secretName" }
}
if ([string]$integration.work_management.provider -ne 'none') { throw 'provider default deve ser none' }
if (-not [bool]$integration.work_management.sync_policy.external_done_requires_global_done) { throw 'external_done_requires_global_done default deve ser true' }

Write-Host 'Work management contract: OK'
