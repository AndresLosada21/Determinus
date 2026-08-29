param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$Remote = "origin",
    [string]$Branch = "",
    [switch]$Audit
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

$git = Get-Command git -ErrorAction SilentlyContinue
if ($null -eq $git) { throw "git não encontrado" }
Push-Location $ProjectRoot
try {
    $local = ((Invoke-ExternalChecked -Command $git.Source -Arguments @("rev-parse","HEAD") -PassThru) | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($Branch)) {
        $Branch = ((Invoke-ExternalChecked -Command $git.Source -Arguments @("branch","--show-current") -PassThru) | Out-String).Trim()
    }
    if ([string]::IsNullOrWhiteSpace($Branch)) { throw "Branch atual não determinada." }
    $raw = @((Invoke-ExternalChecked -Command $git.Source -Arguments @("ls-remote","--heads",$Remote,"refs/heads/$Branch") -PassThru))
    $line = (($raw | Out-String).Trim() -split "`r?`n" | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($line)) { throw "Branch remoto ausente: $Remote/$Branch" }
    $remoteSha = ($line -split "\s+")[0]
    if ($local -ne $remoteSha) { throw "PUSH_NOT_VALIDATED: local HEAD=$local; remote $Remote/$Branch=$remoteSha" }
    Write-Host "PUSH_VALIDATED: $Remote/$Branch -> $local"
    if ($Audit) {
        Add-AuditEvent -ProjectRoot $ProjectRoot -EventType "git.push-verified" -Actor "integrator" -Plane "engineering" -Action "verify-remote-sha" -Status "VALIDATED" -EvidenceRefs @("git:$local") -Metadata @{ remote=$Remote; branch=$Branch } | Out-Null
    }
} finally {
    Pop-Location
}
