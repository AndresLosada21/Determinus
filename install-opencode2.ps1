[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$KeepBackup
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginSource = Join-Path $root 'plugin'
$configDir = Join-Path $HOME '.config/opencode'
$deployRoot = Join-Path $HOME '.local/share/Determinus'
$pluginTarget = Join-Path $deployRoot 'plugin'
$backupRoot = Join-Path $deployRoot '.backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path $deployRoot ('.stage-' + $stamp)
$backup = Join-Path $backupRoot $stamp

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required command not found: $Name" }
}
function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}
function Copy-ManagedFile([string]$Source, [string]$Destination) {
  Ensure-Directory (Split-Path -Parent $Destination)
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}
function Assert-PluginManifest([string]$Path) {
  $manifestPath = Join-Path $Path 'dist/plugin-bundle-manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Plugin bundle manifest is missing.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  foreach ($entry in $manifest.files.PSObject.Properties) {
    $bundle = Join-Path $Path ('dist/' + $entry.Name + '.js')
    if (-not (Test-Path -LiteralPath $bundle)) { throw "Bundle is missing: $($entry.Name).js" }
    $actual = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $entry.Value.ToLowerInvariant()) { throw "Bundle hash mismatch: $($entry.Name).js" }
  }
}
function Assert-RuntimeDependencies([string]$Path) {
  $entry = Join-Path $Path 'node_modules/@opencode-ai/plugin/package.json'
  if (-not (Test-Path -LiteralPath $entry)) { throw 'Runtime dependency @opencode-ai/plugin is missing. Installation was not deployed.' }
}
function Get-ConfigPath {
  $jsonc = Join-Path $configDir 'opencode.jsonc'
  $json = Join-Path $configDir 'opencode.json'
  if (Test-Path -LiteralPath $jsonc) { return $jsonc }
  if (Test-Path -LiteralPath $json) { return $json }
  return $json
}
function Move-LegacyIfPresent([string]$Path, [string]$Name) {
  if (Test-Path -LiteralPath $Path) { Move-Item -LiteralPath $Path -Destination (Join-Path $backup $Name) -Force }
}

Require-Command node
Require-Command pnpm

if (-not $SkipBuild) {
  Push-Location $pluginSource
  try {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
    pnpm run check
    if ($LASTEXITCODE -ne 0) { throw 'Plugin validation failed.' }
    pnpm run test:opencode2
    if ($LASTEXITCODE -ne 0) { throw 'OpenCode 2 compatibility tests failed.' }
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw 'Plugin build failed.' }
  } finally { Pop-Location }
}

Assert-PluginManifest $pluginSource
Ensure-Directory $deployRoot
Ensure-Directory $backupRoot
Ensure-Directory $backup
Ensure-Directory $stage

try {
  # Native PowerShell avoids WSL/Git-Bash/rsync path translation on Windows.
  Get-ChildItem -LiteralPath $pluginSource -Force |
    Where-Object { $_.Name -ne 'node_modules' } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force }
  Assert-PluginManifest $stage
  # OpenCode resolves imports from the deployed folder. This check prevents a
  # repeat of the missing @opencode-ai/plugin startup failure.
  Push-Location $stage
  try {
    pnpm install --frozen-lockfile --prod
    if ($LASTEXITCODE -ne 0) { throw 'Staged runtime dependency install failed.' }
  } finally { Pop-Location }
  Assert-RuntimeDependencies $stage
  if (Test-Path -LiteralPath $pluginTarget) { Move-Item -LiteralPath $pluginTarget -Destination (Join-Path $backup 'plugin') -Force }
  Move-Item -LiteralPath $stage -Destination $pluginTarget -Force
} catch {
  if ((-not (Test-Path -LiteralPath $pluginTarget)) -and (Test-Path -LiteralPath (Join-Path $backup 'plugin'))) {
    Move-Item -LiteralPath (Join-Path $backup 'plugin') -Destination $pluginTarget -Force
  }
  throw
}

$commandDir = Join-Path $configDir 'command'
$agentDir = Join-Path $configDir 'agents'
Ensure-Directory $commandDir
Ensure-Directory $agentDir
Get-ChildItem -LiteralPath (Join-Path $root '.opencode/command') -Filter 'determinus-*.md' -File | ForEach-Object {
  Copy-ManagedFile $_.FullName (Join-Path $commandDir $_.Name)
}
Get-ChildItem -LiteralPath (Join-Path $root '.opencode/agents') -Filter 'determinus*.md' -File | ForEach-Object {
  Copy-ManagedFile $_.FullName (Join-Path $agentDir $_.Name)
}

# Clean break: retire only known legacy locations after the new plugin succeeds.
Move-LegacyIfPresent (Join-Path $HOME '.local/share/opencode/plugins/advance') 'legacy-opencode-advance'
Move-LegacyIfPresent (Join-Path $HOME '.local/share/Advance') 'legacy-advance'
Move-LegacyIfPresent (Join-Path $agentDir 'adv.md') 'legacy-adv.md'

$configPath = Get-ConfigPath
Ensure-Directory (Split-Path -Parent $configPath)
$configPluginPath = $pluginTarget.Replace('\', '/')
& node (Join-Path $pluginTarget 'scripts/patch-opencode-config.mjs') $configPath $configPluginPath
if ($LASTEXITCODE -ne 0) { throw 'OpenCode configuration update failed.' }

if (-not $KeepBackup -and (Test-Path -LiteralPath $backup) -and -not (Get-ChildItem -LiteralPath $backup -Force | Select-Object -First 1)) {
  Remove-Item -LiteralPath $backup -Force
}

Write-Host 'DETERMINUS_INSTALL_OK'
Write-Host ('Plugin: ' + $pluginTarget)
Write-Host ('Config: ' + $configPath)
Write-Host 'Restart the official OpenCode Beta. No host patch, source build, or OpenCode rebuild is required.'
