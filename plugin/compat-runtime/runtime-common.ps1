$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Write-JsonFile([string]$Path, $Value, [int]$Depth = 20) {
    $json = ($Value | ConvertTo-Json -Depth $Depth) + [Environment]::NewLine
    Write-Utf8NoBom $Path $json
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "JSON ausente: $Path" }
    return ([System.IO.File]::ReadAllText($Path) | ConvertFrom-Json)
}

function Remove-JsonComments([string]$Text) {
    $sb = New-Object System.Text.StringBuilder
    $inString = $false
    $escape = $false
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $c = $Text[$i]
        $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }
        if ($inString) {
            [void]$sb.Append($c)
            if ($escape) { $escape = $false; continue }
            if ($c -eq '\') { $escape = $true; continue }
            if ($c -eq '"') { $inString = $false }
            continue
        }
        if ($c -eq '"') {
            $inString = $true
            [void]$sb.Append($c)
            continue
        }
        if ($c -eq '/' -and $next -eq '/') {
            $i += 2
            while ($i -lt $Text.Length -and $Text[$i] -ne "`n" -and $Text[$i] -ne "`r") { $i++ }
            if ($i -lt $Text.Length) { [void]$sb.Append($Text[$i]) }
            continue
        }
        if ($c -eq '/' -and $next -eq '*') {
            $i += 2
            while ($i + 1 -lt $Text.Length -and -not ($Text[$i] -eq '*' -and $Text[$i + 1] -eq '/')) { $i++ }
            $i++
            continue
        }
        [void]$sb.Append($c)
    }
    return $sb.ToString()
}

function Remove-JsonTrailingCommas([string]$Text) {
    return [regex]::Replace($Text, ',\s*([}\]])', '$1')
}

function Read-JsoncFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "Config ausente: $Path" }
    $raw = [System.IO.File]::ReadAllText($Path)
    $clean = Remove-JsonComments $raw
    $clean = Remove-JsonTrailingCommas $clean
    return ($clean | ConvertFrom-Json)
}

function Resolve-OpenCodeCli {
    foreach ($candidate in @("opencode2", "opencode")) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($null -ne $cmd) {
            return [pscustomobject]@{ Name = $candidate; Command = $cmd }
        }
    }
    return $null
}

function Resolve-PowerShellHost {
    foreach ($candidate in @("pwsh", "powershell")) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($null -ne $cmd) { return $cmd.Source }
    }
    throw "PowerShell host não encontrado."
}

function Invoke-ExternalChecked {
    param(
        [Parameter(Mandatory=$true)][string]$Command,
        [string[]]$Arguments = @(),
        [int[]]$AllowedExitCodes = @(0),
        [switch]$PassThru
    )
    $output = @(& $Command @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    if ($AllowedExitCodes -notcontains $exitCode) {
        $details = ($output | Out-String).Trim()
        throw "Comando falhou (exit=$exitCode): $Command $($Arguments -join ' ')`n$details"
    }
    if ($PassThru) { return $output }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Get-AiRoot([string]$ProjectRoot) {
    $root = [IO.Path]::GetFullPath($ProjectRoot)
    if (-not (Test-Path -LiteralPath $root)) { throw "Projeto não encontrado: $root" }
    $ai = Join-Path $root ".ai"
    if (-not (Test-Path -LiteralPath $ai)) { New-Item -ItemType Directory -Path $ai -Force | Out-Null }
    return $ai
}

function Get-CanonicalWorkItemId([string]$ProjectRoot) {
    $ai = Get-AiRoot $ProjectRoot
    $control = Join-Path $ai "control.json"
    if (-not (Test-Path -LiteralPath $control)) { return "" }
    try {
        $obj = Read-JsonFile $control
        return [string]$obj.work_item_id
    } catch {
        return ""
    }
}

function Protect-SecretText([string]$Text) {
    $result = $Text
    foreach ($name in @("GH_TOKEN","GITHUB_TOKEN","JIRA_API_TOKEN","LINEAR_API_KEY","LINEAR_ACCESS_TOKEN")) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value) -and $value.Length -ge 8) {
            $result = $result.Replace($value, "[REDACTED]")
        }
    }
    return $result
}

function Add-AuditEvent {
    param(
        [Parameter(Mandatory=$true)][string]$ProjectRoot,
        [Parameter(Mandatory=$true)][string]$EventType,
        [string]$Actor = "runtime",
        [string]$Plane = "system",
        [string]$Action = "",
        [string]$Status = "OBSERVED",
        [string[]]$EvidenceRefs = @(),
        [hashtable]$Metadata = @{}
    )
    $ai = Get-AiRoot $ProjectRoot
    $path = Join-Path $ai "audit.jsonl"
    $safeMetadata = [ordered]@{}
    foreach ($k in $Metadata.Keys) {
        $safeMetadata[$k] = Protect-SecretText ([string]$Metadata[$k])
    }
    $event = [ordered]@{
        schema_version = 1
        event_id = [Guid]::NewGuid().ToString("N")
        timestamp = [DateTime]::UtcNow.ToString("o")
        work_item_id = Get-CanonicalWorkItemId $ProjectRoot
        event_type = $EventType
        actor = $Actor
        plane = $Plane
        action = $Action
        status = $Status
        evidence_refs = @($EvidenceRefs)
        metadata = $safeMetadata
    }
    $line = ($event | ConvertTo-Json -Depth 10 -Compress) + [Environment]::NewLine
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::AppendAllText($path, $line, $encoding)
    return $event
}


function Upsert-NormalizedWorkItem {
    param(
        [Parameter(Mandatory=$true)][string]$ProjectRoot,
        [Parameter(Mandatory=$true)][string]$InternalId,
        [string]$Provider = "none",
        [string]$ExternalId = "",
        [string]$ExternalKey = "",
        [string]$Url = "",
        [string]$Title = "",
        [string]$ExternalStatus = ""
    )
    if ([string]::IsNullOrWhiteSpace($InternalId)) { return $null }
    $ai = Get-AiRoot $ProjectRoot
    $dir = Join-Path $ai "work-items"
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $safeName = ($InternalId -replace '[^0-9A-Za-z._-]', '_')
    $path = Join-Path $dir "$safeName.json"
    if (Test-Path -LiteralPath $path) {
        $obj = Read-JsonFile $path
    } else {
        $obj = [pscustomobject]@{
            schema_version = 1
            internal_id = $InternalId
            title = ""
            type = "task"
            priority = ""
            dependencies = @()
            provider = "none"
            external_id = ""
            external_key = ""
            url = ""
            external_status = ""
            assignee = ""
            links = [pscustomobject]@{ branch=""; pull_request=""; commits=@() }
            sync = [pscustomobject]@{ last_synced_at=""; status="NOT_SYNCED" }
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($Title)) { $obj.title = $Title }
    if (-not [string]::IsNullOrWhiteSpace($Provider)) { $obj.provider = $Provider }
    if (-not [string]::IsNullOrWhiteSpace($ExternalId)) { $obj.external_id = $ExternalId }
    if (-not [string]::IsNullOrWhiteSpace($ExternalKey)) { $obj.external_key = $ExternalKey }
    if (-not [string]::IsNullOrWhiteSpace($Url)) { $obj.url = $Url }
    if (-not [string]::IsNullOrWhiteSpace($ExternalStatus)) { $obj.external_status = $ExternalStatus }
    $obj.sync.last_synced_at = [DateTime]::UtcNow.ToString("o")
    $obj.sync.status = "SYNCED"
    Write-JsonFile $path $obj
    return $path
}


function Update-ControlWorkManagement {
    param(
        [Parameter(Mandatory=$true)][string]$ProjectRoot,
        [Parameter(Mandatory=$true)][string]$Provider,
        [string]$SyncStatus = "SYNCED",
        [string]$ExternalId = "",
        [string]$ExternalKey = "",
        [string]$Url = ""
    )
    $ai = Get-AiRoot $ProjectRoot
    $path = Join-Path $ai "control.json"
    if (-not (Test-Path -LiteralPath $path)) { return }
    $state = Read-JsonFile $path
    if ($null -eq $state.PSObject.Properties["work_management"]) {
        $state | Add-Member -NotePropertyName work_management -NotePropertyValue ([pscustomobject]@{ provider="none"; sync_status="NOT_CONFIGURED"; last_sync_at=""; external_refs=@() })
    }
    $state.work_management.provider = $Provider
    $state.work_management.sync_status = $SyncStatus
    $state.work_management.last_sync_at = [DateTime]::UtcNow.ToString("o")
    if (-not [string]::IsNullOrWhiteSpace($ExternalId) -or -not [string]::IsNullOrWhiteSpace($ExternalKey) -or -not [string]::IsNullOrWhiteSpace($Url)) {
        $exists = @($state.work_management.external_refs | Where-Object {
            ([string]$_.provider -eq $Provider) -and (
                (-not [string]::IsNullOrWhiteSpace($ExternalId) -and [string]$_.external_id -eq $ExternalId) -or
                (-not [string]::IsNullOrWhiteSpace($ExternalKey) -and [string]$_.external_key -eq $ExternalKey) -or
                (-not [string]::IsNullOrWhiteSpace($Url) -and [string]$_.url -eq $Url)
            )
        }).Count -gt 0
        if (-not $exists) {
            $state.work_management.external_refs = @($state.work_management.external_refs) + @([pscustomobject]@{ provider=$Provider; external_id=$ExternalId; external_key=$ExternalKey; url=$Url })
        }
    }
    Write-JsonFile $path $state
}

function Update-NormalizedWorkItemLink {
    param(
        [Parameter(Mandatory=$true)][string]$ProjectRoot,
        [Parameter(Mandatory=$true)][string]$InternalId,
        [ValidateSet("branch","pull_request","commit")][string]$Kind,
        [Parameter(Mandatory=$true)][string]$Value
    )
    $ai = Get-AiRoot $ProjectRoot
    $safeName = ($InternalId -replace '[^0-9A-Za-z._-]', '_')
    $path = Join-Path (Join-Path $ai "work-items") "$safeName.json"
    if (-not (Test-Path -LiteralPath $path)) { return }
    $obj = Read-JsonFile $path
    if ($Kind -eq "branch") { $obj.links.branch = $Value }
    elseif ($Kind -eq "pull_request") { $obj.links.pull_request = $Value }
    elseif ($Kind -eq "commit" -and @($obj.links.commits) -notcontains $Value) { $obj.links.commits = @($obj.links.commits) + @($Value) }
    Write-JsonFile $path $obj
}

function Get-IntegrationConfig([string]$ProjectRoot) {
    $ai = Get-AiRoot $ProjectRoot
    $path = Join-Path $ai "integrations.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Work management não configurado. Arquivo ausente: $path"
    }
    $cfg = Read-JsonFile $path
    if ($null -eq $cfg.work_management) { throw "work_management ausente em $path" }
    return $cfg.work_management
}
