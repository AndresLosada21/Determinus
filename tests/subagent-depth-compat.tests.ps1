$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-subagent-depth-compat-" + [Guid]::NewGuid().ToString('N'))
$fakeBin = Join-Path $tmp 'bin'
New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null
$oldPath = $env:PATH
try {
    # Fake opencode2 accepts both canonical and dual compatibility candidates.
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $fake = Join-Path $fakeBin 'opencode2.cmd'
        $body = @'
@echo off
if /I "%~1"=="--version" goto version
if /I "%~1"=="debug" goto debug
exit /b 0

:version
echo opencode2 v0.0.0-beta-test
exit /b 0

:debug
if /I "%~2"=="config" goto debug_config
exit /b 0

:debug_config
if not "%FAKE_REJECT_EXPERIMENTAL%"=="1" exit /b 0
set "cfg="
if exist "%OPENCODE_CONFIG_DIR%\opencode.jsonc" set "cfg=%OPENCODE_CONFIG_DIR%\opencode.jsonc"
if not defined cfg if exist "%OPENCODE_CONFIG_DIR%\opencode.json" set "cfg=%OPENCODE_CONFIG_DIR%\opencode.json"
if not defined cfg exit /b 0
findstr /C:"experimental" "%cfg%" >nul
if not errorlevel 1 exit /b 23
exit /b 0
'@
        [System.IO.File]::WriteAllText($fake, $body, (New-Object System.Text.UTF8Encoding($false)))
    } else {
        $fake = Join-Path $fakeBin 'opencode2'
        $body = @'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "opencode2 v0.0.0-beta-test"
  exit 0
fi
if [ "$1" = "debug" ] && [ "$2" = "config" ]; then
  if [ "$FAKE_REJECT_EXPERIMENTAL" = "1" ]; then
    cfg="$OPENCODE_CONFIG_DIR/opencode.jsonc"
    [ -f "$cfg" ] || cfg="$OPENCODE_CONFIG_DIR/opencode.json"
    if grep -q '"experimental"' "$cfg" 2>/dev/null; then
      exit 23
    fi
  fi
  exit 0
fi
exit 0
'@
        [System.IO.File]::WriteAllText($fake, $body, (New-Object System.Text.UTF8Encoding($false)))
        & chmod +x $fake
        if ($LASTEXITCODE -ne 0) { throw 'não foi possível tornar fake opencode2 executável' }
    }
    $env:PATH = $fakeBin + [IO.Path]::PathSeparator + $oldPath
    Remove-Item Env:FAKE_REJECT_EXPERIMENTAL -ErrorAction SilentlyContinue

    $target = Join-Path $tmp 'target-dual'
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    & $exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install-opencode.ps1') -Target $target -NoAmbientInstructions
    if ($LASTEXITCODE -ne 0) { throw 'installer compat dual falhou' }

    $cfgPath = if (Test-Path -LiteralPath (Join-Path $target 'opencode.jsonc')) { Join-Path $target 'opencode.jsonc' } else { Join-Path $target 'opencode.json' }
    $raw = [System.IO.File]::ReadAllText($cfgPath)
    if ($raw -notmatch '"subagent_depth"\s*:\s*2') { throw 'root subagent_depth=2 ausente' }
    if ($raw -notmatch '"experimental"[\s\S]*"subagent_depth"\s*:\s*2') { throw 'fallback experimental.subagent_depth=2 ausente para opencode2 compatível' }

    $manifest = Get-Content -LiteralPath (Join-Path $target 'ai-driven-engineering-install.json') -Raw | ConvertFrom-Json
    if ([string]$manifest.config.subagent_depth_mode -ne 'dual-root+experimental') {
        throw "manifesto não registrou modo dual: $($manifest.config.subagent_depth_mode)"
    }

    # Modern/canonical branch: if the installed CLI rejects the legacy mirror,
    # installer must keep root=2 and continue without experimental fallback.
    $env:FAKE_REJECT_EXPERIMENTAL = '1'
    $targetCanonical = Join-Path $tmp 'target-canonical'
    New-Item -ItemType Directory -Path $targetCanonical -Force | Out-Null
    & $exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install-opencode.ps1') -Target $targetCanonical -NoAmbientInstructions
    if ($LASTEXITCODE -ne 0) { throw 'installer canonical fallback falhou' }
    $canonicalPath = if (Test-Path -LiteralPath (Join-Path $targetCanonical 'opencode.jsonc')) { Join-Path $targetCanonical 'opencode.jsonc' } else { Join-Path $targetCanonical 'opencode.json' }
    $canonicalRaw = [System.IO.File]::ReadAllText($canonicalPath)
    if ($canonicalRaw -notmatch '"subagent_depth"\s*:\s*2') { throw 'canonical fallback perdeu root subagent_depth=2' }
    if ($canonicalRaw -match '"experimental"[\s\S]*"subagent_depth"') { throw 'canonical fallback manteve mirror experimental rejeitado' }
    $canonicalManifest = Get-Content -LiteralPath (Join-Path $targetCanonical 'ai-driven-engineering-install.json') -Raw | ConvertFrom-Json
    if ([string]$canonicalManifest.config.subagent_depth_mode -ne 'canonical-root') {
        throw "manifesto não registrou modo canonical-root: $($canonicalManifest.config.subagent_depth_mode)"
    }
    Remove-Item Env:FAKE_REJECT_EXPERIMENTAL -ErrorAction SilentlyContinue

    # Upgrade with an unchanged config must preserve uninstall metadata from the
    # prior manifest while backfilling the newly tracked compatibility mode.
    $targetUpgrade = Join-Path $tmp 'target-manifest-upgrade'
    New-Item -ItemType Directory -Path $targetUpgrade -Force | Out-Null
    $upgradeConfigPath = Join-Path $targetUpgrade 'opencode.jsonc'
$upgradeConfig = @'
{
  "subagent_depth": 2,
  "default_agent": "orchestrator"
}
'@
    $upgradeConfig = $upgradeConfig.Trim()
    [System.IO.File]::WriteAllText($upgradeConfigPath, $upgradeConfig, (New-Object System.Text.UTF8Encoding($false)))
    $upgradeHash = (Get-FileHash -LiteralPath $upgradeConfigPath -Algorithm SHA256).Hash
    $priorConfig = [ordered]@{
        path = $upgradeConfigPath
        existed_before = $true
        changed_by_installer = $true
        backup_path = (Join-Path $tmp 'retained-config-backup.jsonc')
        installed_hash = $upgradeHash
        uninstall_metadata = [ordered]@{ retained = 'yes'; generation = 7 }
    }
    $priorManifest = [ordered]@{
        schema_version = 4
        package_version = '4.2.2'
        agents = [ordered]@{}
        skill = [ordered]@{ files = [ordered]@{}; directories = @() }
        runtime = [ordered]@{ files = [ordered]@{}; directories = @() }
        config = $priorConfig
        ambient = $null
    }
    $priorManifestPath = Join-Path $targetUpgrade 'ai-driven-engineering-install.json'
    [System.IO.File]::WriteAllText($priorManifestPath, ($priorManifest | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
    & $exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install-opencode.ps1') -Target $targetUpgrade -NoAmbientInstructions -SkipRuntimeCheck
    if ($LASTEXITCODE -ne 0) { throw 'installer de upgrade sem alteração de config falhou' }
    $upgradeConfigAfter = [System.IO.File]::ReadAllText($upgradeConfigPath)
    if (-not $upgradeConfigAfter.Equals($upgradeConfig, [StringComparison]::Ordinal)) {
        throw 'upgrade sem alteração de config modificou opencode.jsonc'
    }
    $upgradeManifest = Get-Content -LiteralPath $priorManifestPath -Raw | ConvertFrom-Json
    if ([string]$upgradeManifest.config.path -ne $upgradeConfigPath) { throw 'upgrade perdeu config.path' }
    if (-not [bool]$upgradeManifest.config.existed_before) { throw 'upgrade perdeu config.existed_before' }
    if (-not [bool]$upgradeManifest.config.changed_by_installer) { throw 'upgrade perdeu config.changed_by_installer' }
    if ([string]$upgradeManifest.config.backup_path -ne $priorConfig.backup_path) { throw 'upgrade perdeu config.backup_path de uninstall' }
    if ([string]$upgradeManifest.config.installed_hash -ne $upgradeHash) { throw 'upgrade perdeu config.installed_hash de uninstall' }
    if ([string]$upgradeManifest.config.uninstall_metadata.retained -ne 'yes' -or [int]$upgradeManifest.config.uninstall_metadata.generation -ne 7) {
        throw 'upgrade perdeu metadata adicional de uninstall'
    }
    if ([string]$upgradeManifest.config.subagent_depth_mode -ne 'canonical-root') {
        throw "upgrade não fez backfill de subagent_depth_mode: $($upgradeManifest.config.subagent_depth_mode)"
    }

    # Contract checks: current owners that need nested delegation carry per-agent
    # depth as defense-in-depth, and the operational smoke exists.
    foreach ($name in @('project-manager','engineer')) {
        $agent = [System.IO.File]::ReadAllText((Join-Path $root "agents/$name.md"))
        if ($agent -notmatch '(?m)^subagent_depth:\s*2\s*$') { throw "$name sem subagent_depth: 2 no frontmatter" }
    }

    $nested = Join-Path $root 'runtime/nested-delegation-smoke.ps1'
    if (-not (Test-Path -LiteralPath $nested)) { throw 'nested-delegation-smoke.ps1 ausente' }
    $nestedText = [System.IO.File]::ReadAllText($nested)
    foreach ($marker in @('NESTED_DELEGATION_OK','SUBAGENT_DEPTH_VALIDATED','project-manager','tracker-operator','sessionId','export')) {
        if ($nestedText -notmatch [regex]::Escape($marker)) { throw "nested smoke sem marcador: $marker" }
    }

    Write-Host 'Subagent depth compatibility: OK'
} finally {
    Remove-Item Env:FAKE_REJECT_EXPERIMENTAL -ErrorAction SilentlyContinue
    $env:PATH = $oldPath
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
