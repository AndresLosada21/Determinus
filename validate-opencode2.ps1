[CmdletBinding()]
param([ValidateSet('go','zen','go,zen')][string]$Require='go',[string]$Cli)
$ErrorActionPreference='Stop'
$arguments=@((Join-Path $PSScriptRoot 'validate.mjs'),'--require',$Require)
if ($Cli) { $arguments+=@('--cli',$Cli) }
& node @arguments
if ($LASTEXITCODE -eq 2) { Write-Host 'Pendente: reinicie OpenCode e use ao menos dois turnos normais na mesma sessao. Execute novamente.'; exit 2 }
if ($LASTEXITCODE -ne 0) { throw 'Falha na validacao.' }
