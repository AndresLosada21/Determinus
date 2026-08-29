param(
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$Model,
    [string]$OutDir = (Join-Path (Get-Location).Path ".ai/eval-results")
)
$ErrorActionPreference = "Stop"
if ($null -eq (Get-Command opencode -ErrorAction SilentlyContinue)) { throw "OpenCode CLI não encontrado" }
$scenarioRoot = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "evals"
$scenarios = Join-Path $scenarioRoot "scenarios.jsonl"
if (-not (Test-Path -LiteralPath $scenarios)) { throw "Cenários não encontrados: $scenarios" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$index = 0
foreach ($line in Get-Content -LiteralPath $scenarios) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $index++
    $s = $line | ConvertFrom-Json
    $path = Join-Path $OutDir (("{0:D2}-{1}.jsonl" -f $index, $s.id))
    $args = @('run','--agent',[string]$s.agent,'--dir',$ProjectRoot,'--format','json')
    if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
    $args += @([string]$s.prompt)
    & opencode @args | Out-File -LiteralPath $path -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Eval falhou: $($s.id)" }
    Write-Host "Salvo: $path"
}
Write-Host "Evals executados. Compare saídas com runtime/evals/RUBRIC.md."
