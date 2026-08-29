param(
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$SourceRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Templates = Join-Path $SourceRoot "skills\ai-driven-engineering\templates"
$AiDir = Join-Path $ProjectRoot ".ai"

New-Item -ItemType Directory -Force -Path $AiDir | Out-Null

$Map = @{
    "product-contract.md"     = "product-contract.md"
    "delivery-contract.md"    = "delivery-contract.md"
    "engineering-contract.md" = "engineering-contract.md"
    "checkpoint.md"           = "checkpoint.md"
    "decision-log.md"         = "decision-log.md"
}

foreach ($Name in $Map.Keys) {
    $Dest = Join-Path $AiDir $Name
    $Src = Join-Path $Templates $Map[$Name]

    if ((Test-Path $Dest) -and -not $Force) {
        Write-Host "Preserved existing: $Dest"
        continue
    }

    Copy-Item $Src $Dest -Force
    Write-Host "Created: $Dest"
}

Write-Host ""
Write-Host "Project AI-delivery artifacts initialized in $AiDir"
