param(
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$Model,
    [string]$OutDir = (Join-Path (Get-Location).Path ".ai/eval-results")
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")
$cli = Resolve-OpenCodeCli
if ($null -eq $cli) { throw "OpenCode CLI não encontrado" }
$cliName = $cli.Name
$scenarioRoot = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "evals"
$scenarios = Join-Path $scenarioRoot "scenarios.jsonl"
if (-not (Test-Path -LiteralPath $scenarios)) { throw "Cenários não encontrados: $scenarios" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$index = 0
Push-Location -LiteralPath $ProjectRoot
try {
    foreach ($line in Get-Content -LiteralPath $scenarios) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $index++
        $s = $line | ConvertFrom-Json
        $path = Join-Path $OutDir (("{0:D2}-{1}.jsonl" -f $index, $s.id))
        $args = @('run','--agent',[string]$s.agent,'--format','json')
        if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
        $args += @([string]$s.prompt)
        $output = @(& $cliName @args 2>&1)
        $exitCode = $LASTEXITCODE
        $output | Out-File -LiteralPath $path -Encoding utf8
        if ($exitCode -ne 0) { throw "Eval falhou (exit=$exitCode): $($s.id)" }
        Write-Host "Salvo: $path"
    }
} finally {
    Pop-Location
}
Write-Host "Evals executados. Compare saídas com runtime/evals/RUBRIC.md."
