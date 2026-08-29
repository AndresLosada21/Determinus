$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-state-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    & $exe -NoProfile -File (Join-Path $root 'runtime/bootstrap-project.ps1') -ProjectRoot $tmp -WorkItemId 'T-1' -Profile STANDARD
    if ($LASTEXITCODE -ne 0) { throw 'bootstrap falhou' }
    & $exe -NoProfile -File (Join-Path $root 'runtime/validate-ai-state.ps1') -ProjectRoot $tmp
    if ($LASTEXITCODE -ne 0) { throw 'estado inicial inválido' }

    foreach ($step in @(
        @('product','AUTHORIZED_BY_REQUEST'),
        @('delivery','READY'),
        @('delivery','IN_EXECUTION'),
        @('engineering','READY_FOR_IMPLEMENTATION'),
        @('engineering','IMPLEMENTING'),
        @('engineering','VERIFYING'),
        @('engineering','ENGINEERING_ACCEPTED'),
        @('delivery','DELIVERY_ACCEPTED'),
        @('product','PRODUCT_ACCEPTED')
    )) {
        & $exe -NoProfile -File (Join-Path $root 'runtime/set-ai-state.ps1') -ProjectRoot $tmp -Plane $step[0] -Status $step[1]
        if ($LASTEXITCODE -ne 0) { throw "transição falhou: $($step -join ' -> ')" }
    }
    $state = Get-Content -LiteralPath (Join-Path $tmp '.ai/control.json') -Raw | ConvertFrom-Json
    if ($state.global_status -ne 'DONE') { throw "global_status deveria ser DONE" }

    # A recusa da transição é o comportamento esperado; capture o exit code sem
    # transformar o stderr do processo filho em erro terminante deste harness.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $exe -NoProfile -File (Join-Path $root 'runtime/set-ai-state.ps1') -ProjectRoot $tmp -Plane engineering -Status IMPLEMENTING 2>$null
        $invalidTransitionExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($invalidTransitionExitCode -eq 0) { throw 'transição inválida após acceptance deveria falhar' }
    Write-Host 'State machine: OK'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
