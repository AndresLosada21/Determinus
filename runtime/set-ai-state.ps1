param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("product", "delivery", "engineering")]
    [string]$Plane,
    [Parameter(Mandatory=$true)]
    [string]$Status,
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$Evidence,
    [string]$Note
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$StatePath = Join-Path (Join-Path $ProjectRoot ".ai") "control.json"
if (-not (Test-Path -LiteralPath $StatePath)) { throw "Estado canônico ausente: $StatePath" }

$transitions = @{
    product = @{
        DRAFT = @("NEEDS_HUMAN_DECISION","AUTHORIZED_BY_REQUEST","APPROVED","SUPERSEDED")
        NEEDS_HUMAN_DECISION = @("DRAFT","AUTHORIZED_BY_REQUEST","APPROVED","SUPERSEDED")
        AUTHORIZED_BY_REQUEST = @("APPROVED","PRODUCT_ACCEPTED","SUPERSEDED")
        APPROVED = @("PRODUCT_ACCEPTED","SUPERSEDED")
        PRODUCT_ACCEPTED = @("SUPERSEDED")
        SUPERSEDED = @()
    }
    delivery = @{
        DRAFT = @("NEEDS_DISCOVERY","NEEDS_DECISION","BLOCKED","READY")
        NEEDS_DISCOVERY = @("DRAFT","NEEDS_DECISION","BLOCKED","READY")
        NEEDS_DECISION = @("DRAFT","BLOCKED","READY")
        BLOCKED = @("NEEDS_DISCOVERY","NEEDS_DECISION","READY")
        READY = @("IN_EXECUTION","BLOCKED")
        IN_EXECUTION = @("BLOCKED","DELIVERY_ACCEPTED")
        DELIVERY_ACCEPTED = @()
    }
    engineering = @{
        DISCOVERING = @("NEEDS_DECISION","READY_FOR_IMPLEMENTATION","BLOCKED")
        NEEDS_DECISION = @("DISCOVERING","READY_FOR_IMPLEMENTATION","BLOCKED")
        BLOCKED = @("DISCOVERING","NEEDS_DECISION","READY_FOR_IMPLEMENTATION")
        READY_FOR_IMPLEMENTATION = @("IMPLEMENTING","BLOCKED")
        IMPLEMENTING = @("VERIFYING","BLOCKED")
        VERIFYING = @("IMPLEMENTING","BLOCKED","ENGINEERING_ACCEPTED")
        ENGINEERING_ACCEPTED = @()
    }
}

$state = [System.IO.File]::ReadAllText($StatePath) | ConvertFrom-Json
$node = $state.$Plane
if ($null -eq $node) { throw "Plano ausente: $Plane" }
$current = [string]$node.status
$target = $Status.ToUpperInvariant()
if (-not $transitions[$Plane].ContainsKey($current)) { throw "Estado atual desconhecido para $Plane: $current" }
if ($target -eq $current) { throw "Transição no-op não permitida: $Plane já está em $target" }
if ($transitions[$Plane][$current] -notcontains $target) {
    throw "Transição inválida em $Plane: $current -> $target"
}

$node.status = $target
$node.revision = [int]$node.revision + 1
$state.revision = [int]$state.revision + 1
$state.updated_at = [DateTime]::UtcNow.ToString("o")

if (-not [string]::IsNullOrWhiteSpace($Evidence)) {
    $entry = [PSCustomObject]@{ at = $state.updated_at; plane = $Plane; status = $target; evidence = $Evidence }
    $state.evidence = @($state.evidence) + @($entry)
}
if (-not [string]::IsNullOrWhiteSpace($Note)) {
    $entry = [PSCustomObject]@{ at = $state.updated_at; plane = $Plane; note = $Note }
    $state.notes = @($state.notes) + @($entry)
}

$accepted = $true
if ($state.product.required -and [string]$state.product.status -ne "PRODUCT_ACCEPTED") { $accepted = $false }
if ($state.delivery.required -and [string]$state.delivery.status -ne "DELIVERY_ACCEPTED") { $accepted = $false }
if ($state.engineering.required -and [string]$state.engineering.status -ne "ENGINEERING_ACCEPTED") { $accepted = $false }
$state.global_status = if ($accepted) { "DONE" } else { "NOT_DONE" }

$encoding = New-Object System.Text.UTF8Encoding($false)
$json = ($state | ConvertTo-Json -Depth 12) + [Environment]::NewLine
$tmp = "$StatePath.tmp-$([Guid]::NewGuid().ToString('N'))"
[System.IO.File]::WriteAllText($tmp, $json, $encoding)
Move-Item -LiteralPath $tmp -Destination $StatePath -Force

Add-AuditEvent -ProjectRoot $ProjectRoot -EventType "state.transition" -Actor "state-runtime" -Plane $Plane -Action "$current->$target" -Status "OBSERVED" -EvidenceRefs @($Evidence) -Metadata @{ global_status=[string]$state.global_status; note=$Note } | Out-Null
Write-Host "$Plane: $current -> $target"
Write-Host "global_status: $($state.global_status)"
