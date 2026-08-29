$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$smoke = [System.IO.File]::ReadAllText((Join-Path $root 'runtime/runtime-smoke.ps1'))
$regression = [System.IO.File]::ReadAllText((Join-Path $root 'runtime/run-regression.ps1'))
$push = [System.IO.File]::ReadAllText((Join-Path $root 'runtime/verify-git-push.ps1'))

if ($smoke -notmatch 'RUNTIME_INVARIANT_FAILED: subagent_depth esperado=2') { throw 'subagent_depth não é assertion dura' }
if ($smoke -notmatch 'RUNTIME_INVARIANT_FAILED: default_agent esperado=orchestrator') { throw 'default_agent não é assertion dura' }
if ($regression -notmatch '\$code = \$LASTEXITCODE') { throw 'regression runner não preserva exit code explicitamente' }
if ($regression -notmatch 'REGRESSION_FAILED') { throw 'regression runner não possui failure gate' }
if ($push -notmatch 'git.*ls-remote' -and $push -notmatch '"ls-remote"') { throw 'push verifier não consulta remote SHA' }
if ($push -notmatch '\$local -ne \$remoteSha') { throw 'push verifier não compara SHA local/remoto' }
if ($push -notmatch 'PUSH_VALIDATED') { throw 'push verifier não emite evidence status' }

Write-Host 'Evidence hardening: OK'
