param(
    [string]$ProjectRoot = (Get-Location).Path,
    [Parameter(Mandatory=$true)][string]$EventType,
    [string]$Actor = "runtime",
    [string]$Plane = "system",
    [string]$Action = "",
    [ValidateSet("OBSERVED","INFERRED","PROPOSED","VALIDATED","UNKNOWN")]
    [string]$Status = "OBSERVED",
    [string[]]$EvidenceRefs = @(),
    [string[]]$Metadata = @()
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

$map = @{}
foreach ($entry in $Metadata) {
    $parts = $entry -split '=', 2
    if ($parts.Count -ne 2) { throw "Metadata deve usar chave=valor: $entry" }
    $map[$parts[0]] = $parts[1]
}
$event = Add-AuditEvent -ProjectRoot $ProjectRoot -EventType $EventType -Actor $Actor -Plane $Plane -Action $Action -Status $Status -EvidenceRefs $EvidenceRefs -Metadata $map
$event | ConvertTo-Json -Depth 10
