$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Read-Text([string]$Rel) {
    $path = Join-Path $root $Rel
    if (-not (Test-Path -LiteralPath $path)) { throw "Arquivo ausente: $Rel" }
    return [System.IO.File]::ReadAllText($path)
}

$explorer = Read-Text 'agents/explorer.md'
$implementer = Read-Text 'agents/implementer.md'
$verifier = Read-Text 'agents/verifier.md'
$engineer = Read-Text 'agents/engineer.md'
$orchestrator = Read-Text 'agents/orchestrator.md'
$pm = Read-Text 'agents/project-manager.md'
$skill = Read-Text 'skills/ai-driven-engineering/SKILL.md'
$reference = Read-Text 'skills/ai-driven-engineering/references/capability-recovery.md'
$ambient = Read-Text 'AGENTS.managed.md'
$engineeringRecoverySmoke = Read-Text 'tooling/ade_tooling/smoke.py'
$releaseAssurance = Read-Text 'runtime/release-assurance.ps1'

foreach ($required in @(
    'DENIAL_SEMANTICS: ACTION_RESOURCE_SCOPED',
    'DENIAL_GLOBAL_INFERENCE: FORBIDDEN',
    'AUTHORIZED_FALLBACK: REQUIRED_WHEN_AVAILABLE',
    'PARENT_EXECUTION_REQUIRED',
    'SPECIFIC_ACTION_RESOURCE_ONLY',
    'git-readonly.ps1',
    'required_owner: project-manager',
    'execution_owner: tracker-operator'
)) {
    if ($explorer -notmatch [regex]::Escape($required)) { throw "Explorer não contém invariant: $required" }
}

if ($explorer -match 'action:\s+shell[\s\S]{0,120}resource:\s+"gh \*"[\s\S]{0,80}effect:\s+allow') { throw 'Explorer não pode receber gh *' }
if ($explorer -match 'action:\s+shell[\s\S]{0,120}resource:\s+"curl \*"[\s\S]{0,80}effect:\s+allow') { throw 'Explorer não pode receber curl *' }
if ($explorer -match 'action:\s+shell[\s\S]{0,120}resource:\s+"docker \*"[\s\S]{0,80}effect:\s+allow') { throw 'Explorer não pode receber docker *' }

foreach ($required in @(
    'DENIAL_SEMANTICS: ACTION_RESOURCE_SCOPED',
    'DENIAL_GLOBAL_INFERENCE: FORBIDDEN',
    'PARENT_EXECUTION_REQUIRED',
    'SPECIFIC_ACTION_RESOURCE_ONLY',
    'required_owner: engineer',
    'execution_owner: verifier',
    'IMPLEMENTED_NOT_VALIDATED'
)) {
    if ($implementer -notmatch [regex]::Escape($required)) { throw "Implementer não contém recovery invariant: $required" }
}
if ($implementer -match 'action:\s+shell[\s\S]{0,120}resource:\s+"\*"[\s\S]{0,80}effect:\s+allow') { throw 'Implementer não pode receber shell *' }
if ($implementer -match 'resource:\s+"git (?:commit|push|add)\*"[\s\S]{0,80}effect:\s+allow') { throw 'Implementer não pode receber Git mutation authority' }
foreach ($required in @('requested_evidence','run-project-check.ps1','não reinterprete o deny original como indisponibilidade global')) {
    if ($verifier -notmatch [regex]::Escape($required)) { throw "Verifier não contém routed-evidence recovery: $required" }
}

foreach ($required in @('CROSS_PLANE_HANDOFF: ORCHESTRATOR_ROUTED','CROSS_PLANE_HANDOFF_REQUIRED','PARENT_EXECUTION_REQUIRED','project-manager')) {
    if ($engineer -notmatch [regex]::Escape($required)) { throw "Engineer não contém recovery invariant: $required" }
}
foreach ($required in @('CROSS_PLANE_HANDOFF: ORCHESTRATOR_ROUTED','CROSS_PLANE_HANDOFF_REQUIRED','project-manager','tracker-operator')) {
    if ($orchestrator -notmatch [regex]::Escape($required)) { throw "Orchestrator não contém cross-plane routing: $required" }
}
foreach ($required in @('requested_evidence','tracker-operator','TRACKER_BLOCKED')) {
    if ($pm -notmatch [regex]::Escape($required)) { throw "Project Manager não contém external-evidence handoff: $required" }
}
foreach ($required in @('deny','action + resource','fallback','Orchestrator','tracker-operator')) {
    if ($reference -notmatch [regex]::Escape($required)) { throw "Capability recovery reference incompleta: $required" }
}
if ($skill -notmatch 'deny.*action \+ resource' -and $skill -notmatch 'action \+ resource.*deny') { throw 'SKILL não explicita deny scoped a action + resource' }
if ($ambient -notmatch 'Permission denied.*action \+ resource') { throw 'AGENTS.managed não contém deny scoping' }
if ($ambient -notmatch 'IMPLEMENTED_NOT_VALIDATED.*engineer.*verifier') { throw 'AGENTS.managed não contém recovery same-plane implementer -> engineer -> verifier' }
foreach ($required in @('PARENT_EXECUTION_REQUIRED','IMPLEMENTED_NOT_VALIDATED','execution_owner: verifier','ade_delegate','verifier','ENGINEERING_RECOVERY_ROUTING_VALIDATED')) {
    if ($engineeringRecoverySmoke -notmatch [regex]::Escape($required)) { throw "Engineering recovery routing smoke incompleto: $required" }
}
try { [scriptblock]::Create($releaseAssurance) | Out-Null } catch { throw "release-assurance.ps1 possui sintaxe PowerShell inválida: $($_.Exception.Message)" }
foreach ($required in @('full-regression','nested-delegation','capability-denial-classification','engineering-recovery-routing','RELEASE_ASSURANCE_VALIDATED')) {
    if ($releaseAssurance -notmatch [regex]::Escape($required)) { throw "Release assurance incompleto: $required" }
}

Write-Host 'Capability denial recovery: OK'
