param(
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)
$ErrorActionPreference = "Stop"
$agents = Join-Path $PackageRoot "agents"
if (-not (Test-Path -LiteralPath $agents)) {
    $parent = Split-Path -Parent $PackageRoot
    $agents = Join-Path $parent "agents"
}
if (-not (Test-Path -LiteralPath $agents)) { throw "agents/ não encontrado a partir de: $PackageRoot" }
$errors = New-Object System.Collections.Generic.List[string]

$specialists = @("explorer","researcher","modeler","engineering-planner","tester","implementer","verifier","debugger","reviewer","security-reviewer","integrator","documenter")
foreach ($file in Get-ChildItem -LiteralPath $agents -Filter "*.md" -File) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $name = [IO.Path]::GetFileNameWithoutExtension($file.Name)
    if ($text -notmatch 'permissions:\s*\r?\n') { $errors.Add("${name}: permissions ausentes") }
    if ($text -notmatch 'action:\s+"?\*"?[\s\S]{0,80}resource:\s+"?\*"?[\s\S]{0,80}effect:\s+deny') { $errors.Add("${name}: deny-all inicial ausente") }
    if ($text -match 'action:\s+external_directory[\s\S]{0,100}effect:\s+allow') { $errors.Add("${name}: external_directory allow proibido") }
    if ($specialists -contains $name) {
        if ($text -match 'effect:\s+ask') { $errors.Add("${name}: specialist não pode depender de ask") }
        if ($text -match 'action:\s+subagent[\s\S]{0,100}effect:\s+allow') { $errors.Add("${name}: specialist não pode criar subagent") }
    }
    if ($name -eq 'project-manager' -and $text -match 'action:\s+shell\s*\r?\n\s+resource:\s+"\*"') { $errors.Add("project-manager: shell * proibido") }
    if ($name -eq 'orchestrator') {
        foreach ($required in @('ROUTING_POLICY: DELEGATE_FIRST','HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE','SUBAGENT_CONFIRMATION: NOT_REQUIRED','ROUTING_FAILURE: ROUTING_BLOCKED')) {
            if ($text -notmatch [regex]::Escape($required)) { $errors.Add("orchestrator: invariant de routing ausente: $required") }
        }
    }
    if ($name -eq 'engineer') {
        foreach ($required in @('ROUTING_POLICY: DELEGATE_FIRST','HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE','explorer','implementer','verifier')) {
            if ($text -notmatch [regex]::Escape($required)) { $errors.Add("engineer: invariant de routing ausente: $required") }
        }
    }
}

if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Host "ERROR: $e" }
    exit 2
}
Write-Host "Static policy: OK"
