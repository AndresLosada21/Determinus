param(
    [string]$ProjectRoot = (Get-Location).Path,
    [Parameter(Mandatory=$true)][string]$Name,
    [ValidateSet('verifier','debugger')][string]$ExpectedOwner = 'verifier',
    [switch]$NoAudit
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

function Resolve-PathInsideProject([string]$Root, [string]$Relative) {
    if ([string]::IsNullOrWhiteSpace($Relative)) { $Relative = "." }
    if ([IO.Path]::IsPathRooted($Relative)) { throw "working_directory deve ser relativo ao projeto: $Relative" }
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@('\\','/'))
    $candidate = [IO.Path]::GetFullPath((Join-Path $rootFull $Relative)).TrimEnd([char[]]@('\\','/'))
    $comparison = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if (-not ($candidate.Equals($rootFull, $comparison) -or $candidate.StartsWith($rootFull + [IO.Path]::DirectorySeparatorChar, $comparison))) {
        throw "working_directory escapa do projeto: $Relative"
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { throw "working_directory inexistente: $candidate" }
    return $candidate
}

function Get-Property($Object, [string]$Name, $Default = $null) {
    $prop = $Object.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $Default }
    return $prop.Value
}

function Assert-StringArray($Value, [string]$Field) {
    if ($null -eq $Value) { return @() }
    $items = @($Value)
    foreach ($item in $items) {
        if ($item -isnot [string]) { throw "$Field deve conter apenas strings." }
        if ($item.IndexOf([char]0) -ge 0) { throw "$Field contém NUL." }
    }
    return $items
}

$root = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Projeto não encontrado: $root" }
$policyPath = Join-Path (Join-Path $root '.ai') 'execution-policy.json'
if (-not (Test-Path -LiteralPath $policyPath)) {
    throw "Execution policy machine-readable ausente: $policyPath. Rode bootstrap-project.ps1 e configure um check autorizado."
}
$policy = Read-JsonFile $policyPath
if ((Get-Property $policy 'authorized' $false) -ne $true) {
    throw "Execution policy não está autorizada. Defina authorized=true somente após revisão humana."
}
$checks = Get-Property $policy 'checks' $null
if ($null -eq $checks) { throw "checks ausente em $policyPath" }
$checkProp = $checks.PSObject.Properties[$Name]
if ($null -eq $checkProp) { throw "Check não registrado: $Name" }
$check = $checkProp.Value
$owner = [string](Get-Property $check 'owner' '')
if ($owner -ne $ExpectedOwner) { throw "Check '$Name' deve ter owner=$ExpectedOwner; atual=$owner" }
if ((Get-Property $check 'non_destructive' $false) -ne $true) { throw "Check '$Name' precisa declarar non_destructive=true." }
$runner = [string](Get-Property $check 'runner' '')
$allowedExitCodes = @((Get-Property $check 'allowed_exit_codes' @(0)) | ForEach-Object { [int]$_ })
if ($allowedExitCodes.Count -eq 0) { $allowedExitCodes = @(0) }

try {
    if ($runner -eq 'process') {
        $workingDirectory = Resolve-PathInsideProject $root ([string](Get-Property $check 'working_directory' '.'))
        $executable = [string](Get-Property $check 'executable' '')
        if ([string]::IsNullOrWhiteSpace($executable)) { throw "executable ausente no check '$Name'." }
        $blocked = @('pwsh','pwsh.exe','powershell','powershell.exe','cmd','cmd.exe','bash','sh','zsh','fish','wsl','docker','podman','git')
        if ($blocked -contains $executable.ToLowerInvariant()) { throw "Executable genérico/bypass proibido no runner process: $executable" }
        $arguments = Assert-StringArray (Get-Property $check 'arguments' @()) 'arguments'
        $command = $null
        if ([IO.Path]::IsPathRooted($executable) -or $executable.Contains('/') -or $executable.Contains('\\')) {
            $candidate = if ([IO.Path]::IsPathRooted($executable)) { [IO.Path]::GetFullPath($executable) } else { [IO.Path]::GetFullPath((Join-Path $workingDirectory $executable)) }
            $rootPrefix = $root.TrimEnd([char[]]@('\\','/')) + [IO.Path]::DirectorySeparatorChar
            $comparison = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
            if (-not ($candidate.StartsWith($rootPrefix, $comparison) -or $candidate.Equals($root, $comparison))) {
                throw "Executable por caminho deve ficar dentro do projeto: $candidate"
            }
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Executable não encontrado: $candidate" }
            $command = $candidate
        } else {
            $resolved = Get-Command $executable -ErrorAction SilentlyContinue
            if ($null -eq $resolved) { throw "Executable não encontrado no PATH: $executable" }
            $command = $resolved.Source
        }
        Push-Location $workingDirectory
        try {
            $out = Invoke-ExternalChecked -Command $command -Arguments $arguments -AllowedExitCodes $allowedExitCodes -PassThru
        } finally {
            Pop-Location
        }
    } elseif ($runner -eq 'docker') {
        $docker = Get-Command docker -ErrorAction SilentlyContinue
        if ($null -eq $docker) { throw "docker não encontrado no PATH." }
        $image = [string](Get-Property $check 'image' '')
        if ($image -notmatch '^[0-9A-Za-z][0-9A-Za-z._/:@-]*$') { throw "Docker image inválida: $image" }
        $network = [string](Get-Property $check 'network' '')
        if ($network -eq 'host') { throw "Docker network=host é proibido para checks controlados." }
        if (-not [string]::IsNullOrWhiteSpace($network) -and $network -notmatch '^[0-9A-Za-z][0-9A-Za-z_.-]*$') { throw "Docker network inválida: $network" }
        $target = [string](Get-Property $check 'project_mount_target' '/workspace')
        if ([string]::IsNullOrWhiteSpace($target) -or $target -match '[,\r\n]') { throw "project_mount_target inválido." }
        $mode = [string](Get-Property $check 'project_mount_mode' 'ro')
        if ($mode -notin @('ro','rw')) { throw "project_mount_mode deve ser ro ou rw." }
        if ($mode -eq 'rw' -and (Get-Property $check 'allow_workspace_writes' $false) -ne $true) {
            throw "Mount rw exige allow_workspace_writes=true revisado na policy."
        }
        $workdir = [string](Get-Property $check 'workdir' $target)
        if ([string]::IsNullOrWhiteSpace($workdir) -or $workdir -match '[\r\n]') { throw "workdir inválido." }
        $commandParts = Assert-StringArray (Get-Property $check 'command' @()) 'command'
        if ($commandParts.Count -eq 0) { throw "command vazio no check '$Name'." }
        if ($root -match ',') { throw "ProjectRoot com vírgula não é suportado pelo mount estruturado: $root" }
        $dockerArgs = @('run','--rm')
        if (-not [string]::IsNullOrWhiteSpace($network)) { $dockerArgs += @('--network',$network) }
        $mountSpec = if ($mode -eq 'ro') { "type=bind,src=$root,dst=$target,readonly" } else { "type=bind,src=$root,dst=$target" }
        $dockerArgs += @('--mount',$mountSpec,'--workdir',$workdir,$image)
        $dockerArgs += $commandParts
        $out = Invoke-ExternalChecked -Command $docker.Source -Arguments $dockerArgs -AllowedExitCodes $allowedExitCodes -PassThru
    } else {
        throw "Runner não suportado em '$Name': $runner. Use process ou docker."
    }

    if (-not $NoAudit) {
        Add-AuditEvent -ProjectRoot $root -EventType $(if ($ExpectedOwner -eq 'verifier') { 'engineering.project-check' } else { 'engineering.diagnostic-check' }) -Actor $ExpectedOwner -Plane 'engineering' -Action $Name -Status $(if ($ExpectedOwner -eq 'verifier') { 'VALIDATED' } else { 'OBSERVED' }) -Metadata @{ runner=$runner; policy='execution-policy.json' } | Out-Null
    }
    $out | ForEach-Object { Write-Output $_ }
    if ($ExpectedOwner -eq 'verifier') { Write-Host "PROJECT_CHECK_VALIDATED: $Name" } else { Write-Host "DIAGNOSTIC_CHECK_COMPLETED: $Name" }
} catch {
    if (-not $NoAudit -and (Test-Path -LiteralPath (Join-Path $root '.ai'))) {
        try { Add-AuditEvent -ProjectRoot $root -EventType $(if ($ExpectedOwner -eq 'verifier') { 'engineering.project-check' } else { 'engineering.diagnostic-check' }) -Actor $ExpectedOwner -Plane 'engineering' -Action $Name -Status 'FAILED' -Metadata @{ error=$_.Exception.Message } | Out-Null } catch {}
    }
    throw
}
