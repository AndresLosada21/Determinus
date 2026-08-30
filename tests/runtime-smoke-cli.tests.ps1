$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$smoke = Join-Path $root 'runtime/runtime-smoke.ps1'
$common = Join-Path $root 'runtime/runtime-common.ps1'
$policy = Join-Path $root 'runtime/static-policy-check.ps1'

$smokeText = [System.IO.File]::ReadAllText($smoke)
$commonText = [System.IO.File]::ReadAllText($common)
if ($commonText -notmatch 'foreach \(\$candidate in @\("opencode2", "opencode"\)\)') {
    throw 'runtime-common deve preferir opencode2 e usar opencode somente como fallback'
}
if ($commonText -match 'foreach \(\$candidate in @\("opencode", "opencode2"\)\)') {
    throw 'ordem de CLI incorreta: opencode V1 antes de opencode2'
}
if ($smokeText -match '&\s+opencode\s+debug config') {
    throw 'runtime-smoke não deve hardcodar opencode no debug config'
}
if ($smokeText -notmatch 'subagent_depth esperado=2') {
    throw 'runtime-smoke deve falhar quando subagent_depth != 2'
}
if ($smokeText -match 'WARN:.*subagent_depth') {
    throw 'subagent_depth não pode ser apenas warning'
}
if ($smokeText -notmatch 'default_agent esperado=orchestrator') {
    throw 'runtime-smoke deve validar default_agent'
}

if ($smokeText -notmatch 'SUBAGENT_DEPTH_CONFIGURED') {
    throw 'runtime-smoke deve distinguir configured de validated'
}
if ($smokeText -notmatch 'SUBAGENT_DEPTH_VALIDATED') {
    throw 'runtime-smoke deve emitir VALIDATED somente após nested probe'
}
$nestedPath = Join-Path $root 'runtime/nested-delegation-smoke.ps1'
if (-not (Test-Path -LiteralPath $nestedPath)) { throw 'nested-delegation-smoke.ps1 ausente' }
$nestedText = [System.IO.File]::ReadAllText($nestedPath)
if ($nestedText -notmatch 'project-manager' -or $nestedText -notmatch 'tracker-operator') {
    throw 'nested-delegation-smoke deve provar orchestrator -> project-manager -> tracker-operator'
}
if ($nestedText -match '--dir' -or $nestedText -match '\$ProjectRoot') {
    throw 'nested-delegation-smoke não pode usar --dir nem ProjectRoot como workspace do agent'
}
if ($nestedText -notmatch 'Push-Location -LiteralPath \$sandbox' -or $nestedText -notmatch 'Remove-Item -LiteralPath \$sandbox') {
    throw 'nested-delegation-smoke deve isolar e remover o sandbox temporário'
}
if ($nestedText -notmatch 'ConvertFrom-StrictJsonLines' -or $nestedText -notmatch 'metadata", "metadata", "sessionID"') {
    throw 'nested-delegation-smoke deve validar o JSONL e sessionID no evento estrutural'
}

$evals = Join-Path $root 'runtime/run-evals.ps1'
$evalsText = [System.IO.File]::ReadAllText($evals)
if ($smokeText -match '--dir' -or $evalsText -match '--dir') {
    throw 'opencode2 run não aceita --dir; probes e evals devem usar Push-Location'
}

$policyText = [System.IO.File]::ReadAllText($policy)
if ($policyText -match '"\$name:') {
    throw 'static-policy-check contém interpolação PowerShell inválida $name:'
}
if ($policyText -notmatch '\$\{name\}: permissions ausentes') {
    throw 'static-policy-check deve usar ${name}: em mensagens interpoladas'
}

$installer = Join-Path $root 'install-opencode.ps1'
$installerText = [System.IO.File]::ReadAllText($installer)
if ($installerText -match '\$PackageVersion\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+"') {
    throw 'installer não deve hardcodar PackageVersion'
}
if ($installerText -notmatch 'Join-Path \$PackageRoot "VERSION"') {
    throw 'installer deve usar VERSION como fonte de verdade'
}
if ($installerText -match 'RunNestedDelegationProbe|ProbeModel') {
    throw 'installer não pode executar probe nested inline antes de uma nova sessão'
}

Write-Host 'Runtime smoke CLI/evidence regressions: OK'
