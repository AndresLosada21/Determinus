#!/usr/bin/env pwsh
# Uninstall Determinus plugin (Windows PowerShell)
# - Removes plugin path from opencode.json (global and optional project)
# - Does NOT delete repo files; use -Purge to remove deployed runtime at ~/.local/share/Determinus

param(
  [string]$ConfigPath = "$env:USERPROFILE\.config\opencode\opencode.json",
  [string]$PluginPath = "",
  [switch]$Purge
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $PluginPath) {
  $PluginPath = (Join-Path $repoRoot "plugin").Replace('\','/')
}
$tildePath = "~/.local/share/Determinus/plugin"
$deployedPath = "$env:USERPROFILE\.local\share\Determinus\plugin"

function Log($m){ Write-Host "==> $m" -ForegroundColor Cyan }

if (-not (Test-Path $ConfigPath)) { Write-Warning "opencode.json not found: $ConfigPath (nothing to do)"; exit 0 }

$raw = Get-Content -Raw $ConfigPath
try { $json = $raw | ConvertFrom-Json } catch { Write-Error "Invalid JSON: $_"; exit 1 }

if (-not $json.PSObject.Properties['plugins']) { Log "No plugins key - already uninstalled."; exit 0 }

$bak = "$ConfigPath.bak-uninstall-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item $ConfigPath $bak
Log "Backup: $bak"

$before = @($json.plugins).Count
# remove matching entries: exact repo path, tilde path, and deployed windows path
$json.plugins = @($json.plugins | Where-Object { $_ -ne $PluginPath -and $_ -ne $tildePath -and $_ -ne $deployedPath.Replace('\','/') })
$after = @($json.plugins).Count

if ($after -eq 0) {
  $json.PSObject.Properties.Remove('plugins')
  Log "Removed plugins key (empty)."
} elseif ($after -eq $before) {
  Log "Plugin not found in config (already removed)."
} else {
  Log "Removed $($before - $after) entry(ies)."
}

($json | ConvertTo-Json -Depth 100) | Set-Content -Encoding utf8 $ConfigPath

if ($Purge -and (Test-Path $deployedPath)) {
  Log "Purging deployed runtime $deployedPath"
  Remove-Item -Recurse -Force $deployedPath
}

Log "Restarting service..."
try { opencode2 service restart 2>&1 | Out-String | Write-Host } catch { Write-Warning $_ }
Start-Sleep -Seconds 3
try { opencode2 service status | Write-Host } catch {}

Log "Determinus uninstalled. Restart TUI."
