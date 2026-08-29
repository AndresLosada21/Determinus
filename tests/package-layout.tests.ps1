$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$required = @(
    'VERSION','README.md','install-opencode.ps1','uninstall-opencode.ps1','AGENTS.managed.md','opencode-fragment.jsonc',
    'skills/ai-driven-engineering/SKILL.md',
    'skills/ai-driven-engineering/templates/integrations.json',
    'skills/ai-driven-engineering/templates/traceability.json',
    'skills/ai-driven-engineering/templates/work-item.json',
    'skills/ai-driven-engineering/templates/execution-policy.json',
    'runtime/runtime-common.ps1','runtime/bootstrap-project.ps1','runtime/set-ai-state.ps1','runtime/validate-ai-state.ps1',
    'runtime/runtime-smoke.ps1','runtime/work-management.ps1','runtime/traceability.ps1','runtime/audit-log.ps1',
    'runtime/run-regression.ps1','runtime/verify-git-push.ps1','runtime/git-readonly.ps1','runtime/run-project-check.ps1','runtime/register-project-check.ps1',
    'scripts/bootstrap-project.ps1'
)
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) { throw "Arquivo obrigatório ausente: $rel" }
}
$agents = @(Get-ChildItem -LiteralPath (Join-Path $root 'agents') -Filter '*.md' -File)
if ($agents.Count -ne 17) { throw "Esperados 17 agents, encontrados $($agents.Count)" }
if (-not (Test-Path -LiteralPath (Join-Path $root 'agents/tracker-operator.md'))) { throw "tracker-operator ausente" }
$skillLines = @(Get-Content -LiteralPath (Join-Path $root 'skills/ai-driven-engineering/SKILL.md')).Count
if ($skillLines -gt 500) { throw "SKILL.md excede 500 linhas: $skillLines" }
$config = [System.IO.File]::ReadAllText((Join-Path $root 'opencode-fragment.jsonc'))
if ($config -notmatch '"subagent_depth"\s*:\s*2') { throw "subagent_depth raiz ausente" }
if ($config -match '"experimental"[\s\S]*"subagent_depth"') { throw "subagent_depth não deve ficar em experimental" }
Write-Host "Package layout: OK"
