param(
    [string]$ProjectRoot = (Get-Location).Path,
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][ValidateSet('process','docker')][string]$Runner,
    [ValidateSet('verifier','debugger')][string]$Owner = 'verifier',
    [string]$Executable = '',
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = '.',
    [bool]$AllowHostProcess = $true,
    [string]$Image = '',
    [string]$Network = '',
    [string]$ProjectMountTarget = '/workspace',
    [ValidateSet('ro','rw')][string]$ProjectMountMode = 'ro',
    [switch]$AllowWorkspaceWrites,
    [string]$ContainerWorkdir = '',
    [string[]]$Command = @(),
    [int[]]$AllowedExitCodes = @(0),
    [switch]$AuthorizePolicy
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'runtime-common.ps1')
$root = [IO.Path]::GetFullPath($ProjectRoot)
$ai = Join-Path $root '.ai'
if (-not (Test-Path -LiteralPath $ai -PathType Container)) { throw ".ai ausente. Rode bootstrap-project.ps1 primeiro." }
$path = Join-Path $ai 'execution-policy.json'
if (Test-Path -LiteralPath $path) {
    $policy = Read-JsonFile $path
} else {
    $policy = [pscustomobject]@{ schema_version=1; authorized=$false; policy_owner='human'; checks=[pscustomobject]@{} }
}
if ($null -eq $policy.PSObject.Properties['checks']) { $policy | Add-Member -NotePropertyName checks -NotePropertyValue ([pscustomobject]@{}) }

$entry = [ordered]@{ owner=$Owner; non_destructive=$true; runner=$Runner; allowed_exit_codes=@($AllowedExitCodes) }
if ($Runner -eq 'process') {
    if ([string]::IsNullOrWhiteSpace($Executable)) { throw '-Executable é obrigatório para runner=process.' }
    $entry.allow_host_process = [bool]$AllowHostProcess
    $entry.working_directory = $WorkingDirectory
    $entry.executable = $Executable
    $entry.arguments = @($Arguments)
} else {
    if ([string]::IsNullOrWhiteSpace($Image)) { throw '-Image é obrigatório para runner=docker.' }
    if (@($Command).Count -eq 0) { throw '-Command é obrigatório para runner=docker.' }
    $entry.image = $Image
    $entry.network = $Network
    $entry.project_mount_target = $ProjectMountTarget
    $entry.project_mount_mode = $ProjectMountMode
    $entry.allow_workspace_writes = [bool]$AllowWorkspaceWrites
    $entry.workdir = if ([string]::IsNullOrWhiteSpace($ContainerWorkdir)) { $ProjectMountTarget } else { $ContainerWorkdir }
    $entry.command = @($Command)
}

if ($null -ne $policy.checks.PSObject.Properties[$Name]) {
    $policy.checks.PSObject.Properties.Remove($Name)
}
$policy.checks | Add-Member -NotePropertyName $Name -NotePropertyValue ([pscustomobject]$entry)
if ($AuthorizePolicy) { $policy.authorized = $true }
Write-JsonFile $path $policy
Write-Host "Check registrado: $Name ($Runner, owner=$Owner)"
Write-Host "Policy autorizada: $($policy.authorized)"
Write-Host "Revise: $path"
