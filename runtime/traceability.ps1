param(
    [string]$ProjectRoot = (Get-Location).Path,
    [ValidateSet("init","link-external","link-branch","link-commit","link-pr","link-evidence","show")]
    [string]$Action = "show",
    [string]$Provider,
    [string]$ExternalId,
    [string]$ExternalKey,
    [string]$Url,
    [string]$Relationship = "tracks",
    [string]$Value,
    [string]$EvidenceType = "runtime"
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

$ai = Get-AiRoot $ProjectRoot
$path = Join-Path $ai "traceability.json"

function New-Traceability {
    return [ordered]@{
        schema_version = 1
        work_item_id = Get-CanonicalWorkItemId $ProjectRoot
        revision = 0
        updated_at = [DateTime]::UtcNow.ToString("o")
        external = @()
        branches = @()
        commits = @()
        pull_requests = @()
        evidence = @()
    }
}

if (-not (Test-Path -LiteralPath $path)) {
    Write-JsonFile $path (New-Traceability)
}

$obj = Read-JsonFile $path
if ($Action -eq "show") { $obj | ConvertTo-Json -Depth 20; exit 0 }
if ($Action -eq "init") { Write-JsonFile $path (New-Traceability); Write-Host "Traceability initialized: $path"; exit 0 }

switch ($Action) {
    "link-external" {
        if ([string]::IsNullOrWhiteSpace($Provider)) { throw "Provider obrigatório" }
        if ([string]::IsNullOrWhiteSpace($ExternalId) -and [string]::IsNullOrWhiteSpace($ExternalKey)) { throw "ExternalId ou ExternalKey obrigatório" }
        $exists = @($obj.external | Where-Object { [string]$_.provider -eq $Provider -and (([string]$_.external_id -eq $ExternalId -and $ExternalId) -or ([string]$_.external_key -eq $ExternalKey -and $ExternalKey)) }).Count -gt 0
        if (-not $exists) {
            $obj.external = @($obj.external) + @([pscustomobject]@{ provider=$Provider; external_id=$ExternalId; external_key=$ExternalKey; url=$Url; relationship=$Relationship })
        }
    }
    "link-branch" {
        if ([string]::IsNullOrWhiteSpace($Value)) { throw "Value obrigatório" }
        if (@($obj.branches) -notcontains $Value) { $obj.branches = @($obj.branches) + @($Value) }
    }
    "link-commit" {
        if ([string]::IsNullOrWhiteSpace($Value)) { throw "Value obrigatório" }
        if (@($obj.commits) -notcontains $Value) { $obj.commits = @($obj.commits) + @($Value) }
    }
    "link-pr" {
        if ([string]::IsNullOrWhiteSpace($Url)) { throw "Url obrigatório" }
        $exists = @($obj.pull_requests | Where-Object { [string]$_.url -eq $Url }).Count -gt 0
        if (-not $exists) { $obj.pull_requests = @($obj.pull_requests) + @([pscustomobject]@{ provider=$Provider; url=$Url; external_id=$ExternalId }) }
    }
    "link-evidence" {
        if ([string]::IsNullOrWhiteSpace($Value)) { throw "Value obrigatório" }
        $exists = @($obj.evidence | Where-Object { [string]$_.ref -eq $Value -and [string]$_.type -eq $EvidenceType }).Count -gt 0
        if (-not $exists) { $obj.evidence = @($obj.evidence) + @([pscustomobject]@{ type=$EvidenceType; ref=$Value }) }
    }
}
$obj.revision = [int]$obj.revision + 1
$obj.updated_at = [DateTime]::UtcNow.ToString("o")
Write-JsonFile $path $obj
Add-AuditEvent -ProjectRoot $ProjectRoot -EventType "traceability.$Action" -Actor "traceability-runtime" -Plane "system" -Action $Action -Status "OBSERVED" -Metadata @{ provider=$Provider; external_id=$ExternalId; external_key=$ExternalKey; url=$Url; value=$Value } | Out-Null
Write-Host "Traceability updated: $path"
