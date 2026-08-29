$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-tracker-gate-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    & $exe -NoProfile -File (Join-Path $root 'runtime/bootstrap-project.ps1') -ProjectRoot $tmp -WorkItemId 'TRACK-1' -Profile STANDARD
    if ($LASTEXITCODE -ne 0) { throw 'bootstrap falhou' }

    $path = Join-Path $tmp '.ai/integrations.json'
    $cfg = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $cfg.work_management.provider = 'github'
    $cfg.work_management.github.owner = 'example'
    $cfg.work_management.github.repository = 'repo'
    $cfg.work_management.github.done_status = 'Done'
    $cfg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $path -Encoding UTF8

    & $exe -NoProfile -File (Join-Path $root 'runtime/work-management.ps1') -ProjectRoot $tmp -Action transition -ExternalId 1 -Status Done -DryRun 2>$null
    if ($LASTEXITCODE -eq 0) { throw 'external Done deveria bloquear quando global_status != DONE' }

    Write-Host 'Work management terminal gate: OK'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
