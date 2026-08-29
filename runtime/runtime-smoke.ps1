param(
    [string]$Target = (Join-Path $HOME ".config/opencode"),
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$RunAgentProbe,
    [string]$Model
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

$requiredAgents = @("orchestrator","product-owner","project-manager","engineer","tracker-operator","explorer","researcher","modeler","engineering-planner","tester","implementer","verifier","debugger","reviewer","security-reviewer","integrator","documenter")
foreach ($name in $requiredAgents) {
    $p = Join-Path (Join-Path $Target "agents") "$name.md"
    if (-not (Test-Path -LiteralPath $p)) { throw "Agent ausente: $p" }
}
$skill = Join-Path (Join-Path (Join-Path $Target "skills") "ai-driven-engineering") "SKILL.md"
if (-not (Test-Path -LiteralPath $skill)) { throw "Skill ausente: $skill" }

$configCandidates = @((Join-Path $Target "opencode.jsonc"), (Join-Path $Target "opencode.json"))
$configPath = $configCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace([string]$configPath)) { throw "Config OpenCode ausente em: $Target" }
$config = Read-JsoncFile $configPath
if ([int]$config.subagent_depth -ne 2) { throw "RUNTIME_INVARIANT_FAILED: subagent_depth esperado=2; atual=$($config.subagent_depth)" }
if ([string]$config.default_agent -ne "orchestrator") { throw "RUNTIME_INVARIANT_FAILED: default_agent esperado=orchestrator; atual=$($config.default_agent)" }

$cli = Resolve-OpenCodeCli
if ($null -eq $cli) {
    Write-Host "OpenCode CLI não encontrado; layout/config local OK, runtime CLI não pôde ser exercitado."
    exit 0
}

$cliName = $cli.Name
Write-Host "OpenCode: $(& $cliName --version)"
$previous = $env:OPENCODE_CONFIG_DIR
try {
    $env:OPENCODE_CONFIG_DIR = $Target
    $resolved = @(& $cliName debug config 2>&1)
    $exit = $LASTEXITCODE
    if ($exit -ne 0) { throw "$cliName debug config falhou (exit=$exit): $($resolved -join [Environment]::NewLine)" }
    $joined = ($resolved | Out-String)
    if ($joined -notmatch 'orchestrator') { throw "Config resolvida não referencia orchestrator" }

    if ($RunAgentProbe) {
        $args = @('run','--agent','orchestrator','--dir',$ProjectRoot,'--format','json')
        if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
        $args += @('Responda somente com RUNTIME_OK e não use ferramentas.')
        & $cliName @args
        if ($LASTEXITCODE -ne 0) { throw "Probe do orchestrator falhou" }
    }
} finally {
    $env:OPENCODE_CONFIG_DIR = $previous
}
Write-Host "Runtime invariants: default_agent=orchestrator; subagent_depth=2"
Write-Host "Runtime smoke: OK"
