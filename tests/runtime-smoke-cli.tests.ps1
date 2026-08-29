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

Write-Host 'Runtime smoke CLI/evidence regressions: OK'
