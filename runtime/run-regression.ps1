param(
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
    [switch]$SkipInstallerIntegration
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")
$hostExe = Resolve-PowerShellHost

$tests = @(
    "tests/package-layout.tests.ps1",
    "tests/static-policy.tests.ps1",
    "tests/state-machine.tests.ps1",
    "tests/runtime-config-gate.tests.ps1",
    "tests/runtime-smoke-cli.tests.ps1",
    "tests/nested-delegation-smoke.tests.ps1",
    "tests/subagent-depth-compat.tests.ps1",
    "tests/work-management-contract.tests.ps1",
    "tests/work-management-terminal.tests.ps1",
    "tests/traceability.tests.ps1",
    "tests/evidence-hardening.tests.ps1",
    "tests/git-readonly.tests.ps1",
    "tests/project-check-policy.tests.ps1",
    "tests/legacy-bootstrap-shim.tests.ps1"
)
if (-not $SkipInstallerIntegration) { $tests += "tests/installers.integration.ps1" }

$summary = @()
foreach ($rel in $tests) {
    $path = Join-Path $PackageRoot $rel
    if (-not (Test-Path -LiteralPath $path)) { throw "Teste ausente: $rel" }
    Write-Host "=== $rel ==="
    # Alguns testes exercitam falhas deliberadas e capturam seu exit code.
    # Não deixe stderr desses subprocessos interromper o runner antes da
    # decisão explícita baseada no código de saída.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $out = @(& $hostExe -NoProfile -ExecutionPolicy Bypass -File $path 2>&1)
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $out | ForEach-Object { Write-Host $_ }
    $summary += [pscustomobject]@{ test=$rel; exit_code=$code; passed=($code -eq 0) }
    if ($code -ne 0) {
        Write-Host "REGRESSION_FAILED: $rel (exit=$code)"
        $summary | Format-Table -AutoSize
        exit $code
    }
}
$summary | Format-Table -AutoSize
Write-Host "REGRESSION_OK: $($summary.Count) testes."
