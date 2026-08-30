param(
  [switch]$EnableSystemManagedPagefile
)

$ErrorActionPreference = 'Stop'
Write-Host '=== Windows virtual memory / pagefile ==='
$cs = Get-CimInstance Win32_ComputerSystem
$usage = @(Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue)
$os = Get-CimInstance Win32_OperatingSystem

[pscustomobject]@{
  AutomaticManagedPagefile = [bool]$cs.AutomaticManagedPagefile
  FreePhysicalMemoryMB = [math]::Round([double]$os.FreePhysicalMemory / 1024, 0)
  TotalVirtualMemoryMB = [math]::Round([double]$os.TotalVirtualMemorySize / 1024, 0)
  FreeVirtualMemoryMB = [math]::Round([double]$os.FreeVirtualMemory / 1024, 0)
} | Format-List

if ($usage.Count -eq 0) {
  Write-Warning 'Nenhum pagefile ativo foi reportado.'
} else {
  $usage | Select-Object Name, AllocatedBaseSize, CurrentUsage, PeakUsage | Format-Table -AutoSize
}

if ($EnableSystemManagedPagefile) {
  Write-Host 'Solicitando pagefile gerenciado automaticamente pelo Windows...'
  try {
    $cs | Set-CimInstance -Property @{ AutomaticManagedPagefile = $true } | Out-Null
    Write-Host 'PAGEFILE_SYSTEM_MANAGED_ENABLED'
    Write-Warning 'Reinicie o Windows antes de repetir os testes do OpenCode/Bun.'
  } catch {
    Write-Error "Não foi possível alterar automaticamente: $($_.Exception.Message). Execute o PowerShell como Administrador ou use Sistema > Configurações avançadas > Desempenho > Memória virtual."
  }
} elseif (-not $cs.AutomaticManagedPagefile) {
  Write-Warning 'AutomaticManagedPagefile está desativado. O erro Bun os error 1455 pode ocorrer mesmo com espaço livre no disco.'
  Write-Host 'Para habilitar explicitamente, execute como Administrador:'
  Write-Host '.\diagnose-windows-pagefile.ps1 -EnableSystemManagedPagefile'
}
