$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runner = Join-Path $root 'runtime/run-project-check.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-project-check-" + [Guid]::NewGuid().ToString('N'))
$bin = Join-Path $tmp 'bin'
$ai = Join-Path $tmp '.ai'
New-Item -ItemType Directory -Path $bin,$ai -Force | Out-Null
$oldPath = $env:PATH
$oldLog = $env:FAKE_DOCKER_LOG
try {
    $logPath = Join-Path $tmp 'docker-args.txt'
    $env:FAKE_DOCKER_LOG = $logPath
    if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        $fake = Join-Path $bin 'docker.cmd'
        Set-Content -LiteralPath $fake -Encoding ASCII -Value '@echo off','echo %* > "%FAKE_DOCKER_LOG%"','exit /b 0'
    } else {
        $fake = Join-Path $bin 'docker'
        Set-Content -LiteralPath $fake -Encoding UTF8 -Value '#!/bin/sh','printf "%s\n" "$@" > "$FAKE_DOCKER_LOG"','exit 0'
        & chmod +x $fake
    }
    $env:PATH = $bin + [IO.Path]::PathSeparator + $oldPath

    $policyPath = Join-Path $ai 'execution-policy.json'
    $policy = [ordered]@{
        schema_version = 1
        authorized = $false
        policy_owner = 'human'
        checks = [ordered]@{
            feature = [ordered]@{
                owner = 'verifier'
                non_destructive = $true
                runner = 'docker'
                image = 'qb-validate-php:8.3'
                network = 'qb-net'
                project_mount_target = '/app'
                project_mount_mode = 'ro'
                allow_workspace_writes = $false
                workdir = '/app'
                command = @('php','validate_19_local.php')
                allowed_exit_codes = @(0)
            }
        }
    }
    $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $policyPath -Encoding UTF8
    $blocked = $false
    try { & $runner -ProjectRoot $tmp -Name feature -NoAudit 2>$null | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { throw 'Policy authorized=false deveria bloquear execução' }

    $policy.authorized = $true
    $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $policyPath -Encoding UTF8
    $out = @(& $runner -ProjectRoot $tmp -Name feature -NoAudit 2>&1)
    if ($LASTEXITCODE -ne 0 -or (($out | Out-String) -notmatch 'PROJECT_CHECK_VALIDATED')) { throw 'Check docker estruturado falhou' }
    $argsLog = Get-Content -LiteralPath $logPath -Raw
    foreach ($expected in @('run','--rm','--network','qb-net','--mount','readonly','qb-validate-php:8.3','php','validate_19_local.php')) {
        if ($argsLog -notmatch [regex]::Escape($expected)) { throw "Argumento docker esperado ausente: $expected" }
    }

    $policy.checks.feature.network = 'host'
    $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $policyPath -Encoding UTF8
    $blocked = $false
    try { & $runner -ProjectRoot $tmp -Name feature -NoAudit 2>$null | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { throw 'network=host deveria ser rejeitado' }

    $policy.checks.feature.network = 'qb-net'
    $policy.checks.feature.project_mount_mode = 'rw'
    $policy.checks.feature.allow_workspace_writes = $false
    $policy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $policyPath -Encoding UTF8
    $blocked = $false
    try { & $runner -ProjectRoot $tmp -Name feature -NoAudit 2>$null | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { throw 'rw sem allow_workspace_writes deveria ser rejeitado' }

    Write-Host 'Project check policy: OK'
} finally {
    $env:PATH = $oldPath
    $env:FAKE_DOCKER_LOG = $oldLog
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
