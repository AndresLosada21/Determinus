param(
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$StatePath = Join-Path (Join-Path $ProjectRoot ".ai") "control.json"
if (-not (Test-Path -LiteralPath $StatePath)) { throw "Estado canônico ausente: $StatePath" }

$state = [System.IO.File]::ReadAllText($StatePath) | ConvertFrom-Json
$errors = New-Object System.Collections.Generic.List[string]

if ([int]$state.schema_version -ne 1) { $errors.Add("schema_version deve ser 1") }
if ([string]::IsNullOrWhiteSpace([string]$state.work_item_id)) { $errors.Add("work_item_id é obrigatório") }
if (@("LEAN","STANDARD","HIGH_ASSURANCE") -notcontains [string]$state.profile) { $errors.Add("profile inválido: $($state.profile)") }

$allowed = @{
    product     = @("DRAFT","NEEDS_HUMAN_DECISION","AUTHORIZED_BY_REQUEST","APPROVED","SUPERSEDED","PRODUCT_ACCEPTED")
    delivery    = @("DRAFT","NEEDS_DISCOVERY","NEEDS_DECISION","BLOCKED","READY","IN_EXECUTION","DELIVERY_ACCEPTED")
    engineering = @("DISCOVERING","NEEDS_DECISION","READY_FOR_IMPLEMENTATION","IMPLEMENTING","VERIFYING","ENGINEERING_ACCEPTED","BLOCKED")
}
foreach ($plane in @("product","delivery","engineering")) {
    $node = $state.$plane
    if ($null -eq $node) { $errors.Add("plano ausente: $plane"); continue }
    if ($node.required -isnot [bool]) { $errors.Add("$plane.required deve ser boolean") }
    if ($allowed[$plane] -notcontains [string]$node.status) { $errors.Add("$plane.status inválido: $($node.status)") }
    if ([int]$node.revision -lt 0) { $errors.Add("$plane.revision não pode ser negativo") }
}

$accepted = $true
if ($state.product.required -and [string]$state.product.status -ne "PRODUCT_ACCEPTED") { $accepted = $false }
if ($state.delivery.required -and [string]$state.delivery.status -ne "DELIVERY_ACCEPTED") { $accepted = $false }
if ($state.engineering.required -and [string]$state.engineering.status -ne "ENGINEERING_ACCEPTED") { $accepted = $false }
$expectedGlobal = if ($accepted) { "DONE" } else { "NOT_DONE" }
if ([string]$state.global_status -ne $expectedGlobal) {
    $errors.Add("global_status inconsistente: esperado $expectedGlobal, atual $($state.global_status)")
}

$result = [ordered]@{
    valid = ($errors.Count -eq 0)
    work_item_id = [string]$state.work_item_id
    profile = [string]$state.profile
    global_status = [string]$state.global_status
    errors = @($errors)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
} else {
    Write-Host "Work item: $($result.work_item_id)"
    Write-Host "Profile: $($result.profile)"
    Write-Host "Global: $($result.global_status)"
    if ($result.valid) {
        Write-Host "VALID: estado consistente."
    } else {
        foreach ($e in $errors) { Write-Host "ERROR: $e" }
    }
}
if (-not $result.valid) { exit 2 }
