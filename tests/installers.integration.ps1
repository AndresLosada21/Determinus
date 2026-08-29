$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-installer-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    $config = Join-Path $tmp 'opencode.jsonc'
    $original = @'
{
  // preserve-me
  "model": "provider/example",
  "experimental": { "subagent_depth": 1, "other_flag": true },
  "mcp": { "demo": { "type": "remote", "url": "https://example.invalid" } }
}
'@
    [System.IO.File]::WriteAllText($config, $original, (New-Object System.Text.UTF8Encoding($false)))
    $agentsFile = Join-Path $tmp 'AGENTS.md'
    [System.IO.File]::WriteAllText($agentsFile, "# Existing guidance`n", (New-Object System.Text.UTF8Encoding($false)))

    & $exe -NoProfile -File (Join-Path $root 'install-opencode.ps1') -Target $tmp -SkipRuntimeCheck
    if ($LASTEXITCODE -ne 0) { throw 'installer falhou' }
    $patched = [System.IO.File]::ReadAllText($config)
    if ($patched -notmatch '"subagent_depth"\s*:\s*2') { throw 'subagent_depth raiz ausente' }
    if ([regex]::Matches($patched, '"subagent_depth"').Count -ne 1) { throw 'subagent_depth legado em experimental não foi removido' }
    if ($patched -notmatch 'other_flag') { throw 'outro campo experimental foi perdido' }
    if ($patched -notmatch '"default_agent"\s*:\s*"orchestrator"') { throw 'default_agent ausente' }
    if ($patched -notmatch 'preserve-me') { throw 'comentário JSONC foi perdido' }
    if ($patched -notmatch 'provider/example') { throw 'provider/model existente foi perdido' }
    if (-not (Test-Path -LiteralPath (Join-Path $tmp 'agents/orchestrator.md'))) { throw 'orchestrator não instalado' }
    if (-not (Test-Path -LiteralPath (Join-Path $tmp 'skills/ai-driven-engineering/SKILL.md'))) { throw 'skill não instalada' }
    if (-not (Test-Path -LiteralPath (Join-Path $tmp 'ai-driven-engineering/runtime/set-ai-state.ps1'))) { throw 'runtime não instalado' }
    $ambient = [System.IO.File]::ReadAllText($agentsFile)
    if ($ambient -notmatch 'AI-DRIVEN-ENGINEERING:BEGIN v4') { throw 'bloco AGENTS.md não instalado' }
    if ($ambient -notmatch 'Existing guidance') { throw 'AGENTS.md existente foi perdido' }


    # regressão v4.1.1: instalação legada em que experimental contém SOMENTE subagent_depth
    $legacyOnly = Join-Path $tmp 'legacy-only'
    New-Item -ItemType Directory -Path $legacyOnly -Force | Out-Null
    $legacyConfig = Join-Path $legacyOnly 'opencode.json'
    $legacyOriginal = @'
{
  "default_agent": "orchestrator",
  "experimental": {
    "subagent_depth": 2
  },
  "$schema": "https://opencode.ai/config.json"
}
'@
    [System.IO.File]::WriteAllText($legacyConfig, $legacyOriginal, (New-Object System.Text.UTF8Encoding($false)))
    & $exe -NoProfile -File (Join-Path $root 'install-opencode.ps1') -Target $legacyOnly -SkipRuntimeCheck -NoAmbientInstructions
    if ($LASTEXITCODE -ne 0) { throw 'migração legacy-only falhou' }
    $legacyPatched = [System.IO.File]::ReadAllText($legacyConfig)
    if ($legacyPatched -match '"experimental"\s*:') { throw 'experimental vazio permaneceu após remover subagent_depth legado' }
    if ($legacyPatched -notmatch '"subagent_depth"\s*:\s*2') { throw 'subagent_depth raiz ausente no caso legacy-only' }

    # idempotência
    & $exe -NoProfile -File (Join-Path $root 'install-opencode.ps1') -Target $tmp -SkipRuntimeCheck
    if ($LASTEXITCODE -ne 0) { throw 'segunda instalação falhou' }

    & $exe -NoProfile -File (Join-Path $root 'uninstall-opencode.ps1') -Target $tmp
    if ($LASTEXITCODE -ne 0) { throw 'uninstaller falhou' }
    $restored = [System.IO.File]::ReadAllText($config)
    if (-not $restored.Equals($original, [StringComparison]::Ordinal)) { throw 'config original não foi restaurada exatamente' }
    $ambientRestored = [System.IO.File]::ReadAllText($agentsFile)
    if ($ambientRestored -notmatch '^# Existing guidance') { throw 'AGENTS.md original não foi restaurado' }
    if ($ambientRestored -match 'AI-DRIVEN-ENGINEERING:BEGIN v4') { throw 'bloco ambient permaneceu' }
    Write-Host 'Install/uninstall integration: OK'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
