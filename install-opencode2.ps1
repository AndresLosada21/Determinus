[CmdletBinding()]
param([string]$Project,[string]$UserRoot,[string]$ConfigDir,[string]$ConfigFile,[switch]$DryRun,[switch]$Rollback)
$ErrorActionPreference='Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 24 ou superior.' }
$arguments=@((Join-Path $PSScriptRoot 'install.mjs'))
if ($Project) { $arguments+=@('--project',$Project) }
if ($UserRoot) { $arguments+=@('--home',$UserRoot) }
if ($ConfigDir) { $arguments+=@('--config-dir',$ConfigDir) }
if ($ConfigFile) { $arguments+=@('--config',$ConfigFile) }
if ($DryRun) { $arguments+='--dry-run' }
if ($Rollback) { $arguments+='--rollback' }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Instalacao nao concluida (exit=$LASTEXITCODE)." }
