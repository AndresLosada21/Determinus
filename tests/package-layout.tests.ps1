$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$required = @(
    'VERSION','README.md','install-opencode.ps1','uninstall-opencode.ps1','AGENTS.managed.md','opencode-fragment.jsonc',
    'skills/ai-driven-engineering/SKILL.md','runtime/bootstrap-project.ps1','runtime/set-ai-state.ps1','runtime/validate-ai-state.ps1','runtime/runtime-smoke.ps1'
)
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) { throw "Arquivo obrigatório ausente: $rel" }
}
$agents = @(Get-ChildItem -LiteralPath (Join-Path $root 'agents') -Filter '*.md' -File)
if ($agents.Count -ne 16) { throw "Esperados 16 agents, encontrados $($agents.Count)" }
$skillLines = @(Get-Content -LiteralPath (Join-Path $root 'skills/ai-driven-engineering/SKILL.md')).Count
if ($skillLines -gt 500) { throw "SKILL.md excede 500 linhas: $skillLines" }
$config = [System.IO.File]::ReadAllText((Join-Path $root 'opencode-fragment.jsonc'))
if ($config -notmatch '"subagent_depth"\s*:\s*2') { throw "subagent_depth raiz ausente" }
if ($config -match '"experimental"[\s\S]*"subagent_depth"') { throw "subagent_depth não deve ficar em experimental" }
Write-Host "Package layout: OK"
