$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$shim = Join-Path $root 'scripts/bootstrap-project.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-bootstrap-shim-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    & $shim -ProjectRoot $tmp -WorkItemId 'SHIM-001' -Profile STANDARD -Force | Out-Null
    $control = Join-Path $tmp '.ai/control.json'
    $policy = Join-Path $tmp '.ai/execution-policy.json'
    if (-not (Test-Path -LiteralPath $control)) { throw 'control.json não criado pelo shim' }
    if (-not (Test-Path -LiteralPath $policy)) { throw 'execution-policy.json não criado pelo shim' }
    $obj = Get-Content -LiteralPath $policy -Raw | ConvertFrom-Json
    if ($obj.authorized -ne $false) { throw 'execution-policy.json deve nascer authorized=false' }
    Write-Host 'Legacy bootstrap shim: OK'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
