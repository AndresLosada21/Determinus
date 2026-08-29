$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-runtime-gate-test-" + [Guid]::NewGuid().ToString('N'))
$fakeBin = Join-Path $tmp 'fake-bin'
New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null

$oldPath = $env:PATH
try {
    $config = Join-Path $tmp 'opencode.json'
    $original = @'
{
  "model": "provider/example",
  "experimental": {
    "subagent_depth": 2
  }
}
'@
    [System.IO.File]::WriteAllText($config, $original, (New-Object System.Text.UTF8Encoding($false)))

    # Fake opencode2: preflight succeeds, validation against the real target fails.
    # This proves the installer restores the original config and does not write a manifest.
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $fakeCli = Join-Path $fakeBin 'opencode2.cmd'
        $body = @'
@echo off
echo %OPENCODE_CONFIG_DIR% | findstr /C:"ai-driven-config-preflight-" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
echo synthetic invalid config 1>&2
exit /b 23
'@
        [System.IO.File]::WriteAllText($fakeCli, $body, (New-Object System.Text.UTF8Encoding($false)))
    } else {
        $fakeCli = Join-Path $fakeBin 'opencode2'
        $body = @'
#!/bin/sh
case "$OPENCODE_CONFIG_DIR" in
  *ai-driven-config-preflight-*) exit 0 ;;
  *) echo "synthetic invalid config" >&2; exit 23 ;;
esac
'@
        [System.IO.File]::WriteAllText($fakeCli, $body, (New-Object System.Text.UTF8Encoding($false)))
        & chmod +x $fakeCli
        if ($LASTEXITCODE -ne 0) { throw 'não foi possível tornar fake opencode2 executável' }
    }

    $env:PATH = $fakeBin + [IO.Path]::PathSeparator + $oldPath

    $failed = $false
    try {
        & $exe -NoProfile -File (Join-Path $root 'install-opencode.ps1') -Target $tmp -NoAmbientInstructions
        if ($LASTEXITCODE -ne 0) { $failed = $true }
    } catch {
        $failed = $true
    }
    if (-not $failed) { throw 'installer deveria falhar quando debug config rejeita a configuração instalada' }

    $after = [System.IO.File]::ReadAllText($config)
    if (-not $after.Equals($original, [StringComparison]::Ordinal)) {
        throw 'config original não foi restaurada após falha do gate'
    }
    if (Test-Path -LiteralPath (Join-Path $tmp 'ai-driven-engineering-install.json')) {
        throw 'manifesto não deve ser gravado quando o gate runtime falha'
    }

    Write-Host 'Runtime config gate rollback: OK'
} finally {
    $env:PATH = $oldPath
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
