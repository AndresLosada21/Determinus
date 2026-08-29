param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$WorkItemId = "WORK-001",
    [ValidateSet("LEAN", "STANDARD", "HIGH_ASSURANCE")]
    [string]$Profile = "STANDARD",
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$runtimeBootstrap = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime/bootstrap-project.ps1'
if (-not (Test-Path -LiteralPath $runtimeBootstrap)) { throw "Bootstrap runtime ausente: $runtimeBootstrap" }
Write-Warning 'scripts/bootstrap-project.ps1 é um compatibility shim. Prefira runtime/bootstrap-project.ps1.'
& $runtimeBootstrap @PSBoundParameters
