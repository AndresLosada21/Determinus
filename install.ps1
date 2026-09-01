#!/usr/bin/env pwsh
# Install Determinus plugin locally (Windows PowerShell)
# - Build plugin if needed
# - Deploy via scripts/deploy-local.sh --fix when available
# - Or register repo plugin path directly in opencode.json

param(
  [switch]$Build,
  [switch]$Deploy,
  [string]$ConfigPath = "$env:USERPROFILE\.config\opencode\opencode.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginDir = Join-Path $repoRoot "plugin"
$pluginPath = $pluginDir.Replace('\','/')  # opencode expects forward slashes

function Log($m){ Write-Host "==> $m" -ForegroundColor Cyan }
function Die($m){ Write-Error $m; exit 1 }

if (-not (Test-Path $pluginDir)) { Die "plugin dir not found: $pluginDir" }

# optional build
if ($Build) {
  Log "Building Determinus plugin..."
  Push-Location $pluginDir
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Die "pnpm not found. Install Node 24 + pnpm 11" }
  pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { Die "pnpm install failed" }
  pnpm run build
  if ($LASTEXITCODE -ne 0) { Die "pnpm build failed" }
  Pop-Location
}

# prefer official deploy-local.sh if requested or available (bash required)
if ($Deploy -and (Get-Command bash -ErrorAction SilentlyContinue)) {
  $deploy = Join-Path $repoRoot "scripts/deploy-local.sh"
  if (Test-Path $deploy) {
    Log "Deploying via scripts/deploy-local.sh --fix"
    bash $deploy --fix
    if ($LASTEXITCODE -ne 0) { Die "deploy-local.sh failed" }
    Log "Determinus installed via deploy-local.sh"
    exit 0
  }
}

# fallback: register plugin path directly in opencode.json (idempotent)
if (-not (Test-Path $ConfigPath)) { Die "opencode.json not found: $ConfigPath" }
Log "Registering plugin in $ConfigPath -> $pluginPath"
$raw = Get-Content -Raw $ConfigPath
try { $json = $raw | ConvertFrom-Json } catch { Die "Invalid JSON in $ConfigPath : $_" }

# backup
$bak = "$ConfigPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item $ConfigPath $bak
Log "Backup: $bak"

if (-not $json.PSObject.Properties['plugins']) {
  $json | Add-Member -NotePropertyName plugins -NotePropertyValue @()
}
# PS deserializes plugins as object[]; ensure array
$plugins = @($json.plugins)
if ($plugins -contains $pluginPath) {
  Log "Already registered."
} else {
  $plugins += $pluginPath
  $json.plugins = $plugins
  ($json | ConvertTo-Json -Depth 100) | Set-Content -Encoding utf8 $ConfigPath
  Log "Registered."
}

Log "Restarting opencode service..."
try { opencode2 service restart 2>&1 | Out-String | Write-Host } catch { Write-Warning $_ }
Start-Sleep -Seconds 3
try { opencode2 service status | Write-Host } catch {}
try { opencode2 api get /api/health | Write-Host } catch {}

Log "Determinus installed. Restart TUI if needed."
