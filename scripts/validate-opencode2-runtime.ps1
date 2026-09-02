[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$pluginPath = Join-Path $HOME '.local/share/Determinus/plugin'
$configDir = Join-Path $HOME '.config/opencode'
$commandDir = Join-Path $configDir 'command'
$agentDir = Join-Path $configDir 'agents'
$config = @((Join-Path $configDir 'opencode.jsonc'), (Join-Path $configDir 'opencode.json')) |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1

$failures = [System.Collections.Generic.List[string]]::new()
if (-not (Test-Path (Join-Path $pluginPath 'dist/index.js'))) { $failures.Add('Missing deployed plugin bundle.') }
if (-not (Test-Path (Join-Path $pluginPath 'dist/plugin-bundle-manifest.json'))) { $failures.Add('Missing deployed plugin bundle manifest.') }
if (-not (Test-Path (Join-Path $commandDir 'determinus-apply.md'))) { $failures.Add('Missing /determinus-apply command.') }
if (-not (Test-Path (Join-Path $commandDir 'determinus-archive.md'))) { $failures.Add('Missing /determinus-archive command.') }
if (-not (Test-Path (Join-Path $agentDir 'determinus.md'))) { $failures.Add('Missing canonical Determinus agent.') }
if (Test-Path (Join-Path $agentDir 'adv.md')) {
  $failures.Add('Legacy adv.md agent is still installed; reinstall Determinus 3.0.')
}
if (-not $config) { $failures.Add('OpenCode configuration file not found.') }
elseif (-not (Select-String -Path $config -SimpleMatch '.local/share/Determinus/plugin' -Quiet)) { $failures.Add('Stable Determinus plugin path is absent from OpenCode configuration.') }

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host 'DETERMINUS_OPENCODE2_RUNTIME_OK'
Write-Host 'Restart OpenCode before a live tool-catalog test; loaded plugins are not hot-reloaded.'
