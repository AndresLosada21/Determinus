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

$engineeringSpecialists = @("explorer","researcher","modeler","engineering-planner","tester","implementer","verifier","debugger","reviewer","security-reviewer","integrator","documenter")
$leafAgents = @($engineeringSpecialists + @("tracker-operator"))

foreach ($file in Get-ChildItem -LiteralPath $agents -Filter "*.md" -File) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $name = [IO.Path]::GetFileNameWithoutExtension($file.Name)

    if ($text -notmatch 'permissions:\s*\r?\n') { $errors.Add("${name}: permissions ausentes") }
    if ($text -notmatch 'action:\s+"?\*"?[\s\S]{0,80}resource:\s+"?\*"?[\s\S]{0,80}effect:\s+deny') { $errors.Add("${name}: deny-all inicial ausente") }
    if ($text -match 'action:\s+external_directory[\s\S]{0,100}effect:\s+allow') { $errors.Add("${name}: external_directory allow proibido") }

    if ($text -match 'action:\s+shell[\s\S]{0,120}resource:\s+"docker run\*"[\s\S]{0,80}effect:\s+allow') { $errors.Add("${name}: docker run* amplo proibido") }

    if ($leafAgents -contains $name) {
        if ($text -match 'effect:\s+ask') { $errors.Add("${name}: leaf agent não pode depender de ask") }
        if ($text -match 'action:\s+subagent[\s\S]{0,100}effect:\s+allow') { $errors.Add("${name}: leaf agent não pode criar subagent") }
    }

    if ($name -eq 'project-manager') {
        if ($text -notmatch '(?m)^subagent_depth:\s*2\s*$') { $errors.Add("project-manager: subagent_depth: 2 ausente") }
        if ($text -match 'action:\s+shell\s*\r?\n\s+resource:\s+"\*"') { $errors.Add("project-manager: shell * proibido") }
        if ($text -notmatch 'resource:\s+"tracker-operator"[\s\S]{0,80}effect:\s+allow') { $errors.Add("project-manager: tracker-operator não permitido") }
        foreach ($required in @('ROUTING_POLICY: DELEGATE_FIRST','TRACKER_AUTHORITY: EXECUTION_ONLY')) {
            if ($text -notmatch [regex]::Escape($required)) { $errors.Add("project-manager: invariant ausente: $required") }
        }
    }

    if ($name -eq 'tracker-operator') {
        if ($text -notmatch 'work-management\.ps1') { $errors.Add("tracker-operator: work-management.ps1 ausente da allowlist") }
        if ($text -match 'action:\s+edit[\s\S]{0,100}effect:\s+allow') { $errors.Add("tracker-operator: edit direto proibido") }
        if ($text -notmatch 'external_status=Done' -and $text -notmatch 'external Done') { $errors.Add("tracker-operator: invariant de terminal status ausente") }
    }

    if ($name -eq 'orchestrator') {
        foreach ($required in @('ROUTING_POLICY: DELEGATE_FIRST','HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE','SUBAGENT_CONFIRMATION: NOT_REQUIRED','ROUTING_FAILURE: ROUTING_BLOCKED')) {
            if ($text -notmatch [regex]::Escape($required)) { $errors.Add("orchestrator: invariant de routing ausente: $required") }
        }
    }

    if ($name -eq 'engineer') {
        if ($text -notmatch '(?m)^subagent_depth:\s*2\s*$') { $errors.Add("engineer: subagent_depth: 2 ausente") }
        foreach ($required in @('ROUTING_POLICY: DELEGATE_FIRST','HAND_BACK_POLICY: FORBIDDEN_WHEN_EXECUTABLE','explorer','implementer','verifier','git-readonly.ps1','run-project-check.ps1')) {
            if ($text -notmatch [regex]::Escape($required)) { $errors.Add("engineer: invariant de routing ausente: $required") }
        }
    }

    if ($name -eq 'explorer' -and $text -notmatch 'git-readonly\.ps1') { $errors.Add('explorer: git-readonly.ps1 ausente') }
    if ($name -eq 'explorer') {
        foreach ($required in @('DENIAL_SEMANTICS: ACTION_RESOURCE_SCOPED','DENIAL_GLOBAL_INFERENCE: FORBIDDEN','AUTHORIZED_FALLBACK: REQUIRED_WHEN_AVAILABLE','PARENT_EXECUTION_REQUIRED','required_owner: project-manager','execution_owner: tracker-operator')) {
            if ($text -notmatch [regex]::Escape($required)) { $errors.Add("explorer: capability recovery ausente: $required") }
        }
        foreach ($forbidden in @('gh \*','curl \*','docker \*')) {
            if ($text -match ('action:\s+shell[\s\S]{0,120}resource:\s+"' + $forbidden + '"[\s\S]{0,80}effect:\s+allow')) { $errors.Add("explorer: shell amplo proibido: $forbidden") }
        }
    }
    if ($name -eq 'verifier') {
        if ($text -notmatch 'run-project-check\.ps1') { $errors.Add('verifier: run-project-check.ps1 ausente') }
        if ($text -notmatch 'git-readonly\.ps1') { $errors.Add('verifier: git-readonly.ps1 ausente') }
    }
    if ($name -eq 'implementer' -and $text -notmatch 'resource:\s+"\.ai/execution-policy\.json"[\s\S]{0,80}effect:\s+deny') {
        $errors.Add('implementer: execution-policy.json precisa ser imutável')
    }
}

if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Host "ERROR: $e" }
    exit 2
}
Write-Host "Static policy: OK"
