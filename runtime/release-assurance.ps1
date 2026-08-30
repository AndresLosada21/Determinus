param(
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
    [string]$Target = (Join-Path $HOME ".config/opencode"),
    [string]$Model,
    [switch]$SkipInstallerIntegration
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")
$hostExe = Resolve-PowerShellHost

function Invoke-Gate {
    param(
        [string]$Name,
        [string]$Script,
        [string[]]$Arguments = @()
    )
    if (-not (Test-Path -LiteralPath $Script)) { throw "RELEASE_ASSURANCE_FAILED: gate ausente $Name ($Script)" }
    Write-Host "=== RELEASE GATE: $Name ==="
    $previousEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $hostExe -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments 2>&1)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousEap }
    $output | ForEach-Object { Write-Host $_ }
    if ($code -ne 0) { throw "RELEASE_ASSURANCE_FAILED: $Name exit=$code" }
}

$runtime = Join-Path $PackageRoot 'runtime'
Invoke-Gate -Name 'static-policy' -Script (Join-Path $runtime 'static-policy-check.ps1') -Arguments @('-PackageRoot',$PackageRoot)

$regressionArgs = @('-PackageRoot',$PackageRoot)
if ($SkipInstallerIntegration) { $regressionArgs += '-SkipInstallerIntegration' }
Invoke-Gate -Name 'full-regression' -Script (Join-Path $runtime 'run-regression.ps1') -Arguments $regressionArgs

Invoke-Gate -Name 'runtime-config-smoke' -Script (Join-Path $runtime 'runtime-smoke.ps1') -Arguments @('-Target',$Target)

$modelArgs = @('-Target',$Target)
if (-not [string]::IsNullOrWhiteSpace($Model)) { $modelArgs += @('-Model',$Model) }
Invoke-Gate -Name 'nested-delegation' -Script (Join-Path $runtime 'nested-delegation-smoke.ps1') -Arguments $modelArgs
Invoke-Gate -Name 'capability-denial-classification' -Script (Join-Path $runtime 'capability-recovery-smoke.ps1') -Arguments $modelArgs
Invoke-Gate -Name 'engineering-recovery-routing' -Script (Join-Path $runtime 'engineering-recovery-routing-smoke.ps1') -Arguments $modelArgs

Write-Host 'RELEASE_ASSURANCE_VALIDATED'
Write-Host 'INTERNAL_OPERATING_MODEL_VALIDATED: regression + runtime config + nested delegation + capability recovery + engineering continuation'
Write-Host 'NOTE: external provider integration remains a separate provider-specific gate.'
