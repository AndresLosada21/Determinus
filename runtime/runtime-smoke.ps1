param(
    [string]$Target = (Join-Path $HOME ".config/opencode"),
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$RunAgentProbe,
    [switch]$RunNestedDelegationProbe,
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
$compatDepth = $null
if ($null -ne $config.experimental -and $null -ne $config.experimental.subagent_depth) {
    $compatDepth = [int]$config.experimental.subagent_depth
    if ($compatDepth -ne 2) { throw "RUNTIME_INVARIANT_FAILED: experimental.subagent_depth presente mas divergente; esperado=2; atual=$compatDepth" }
}

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
        $agentProbeLocationPushed = $false
        try {
            Push-Location -LiteralPath $ProjectRoot
            $agentProbeLocationPushed = $true
            $args = @('run','--agent','orchestrator','--format','json')
            if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
            $args += @('Responda somente com RUNTIME_OK e não use ferramentas.')
            & $cliName @args
            if ($LASTEXITCODE -ne 0) { throw "Probe do orchestrator falhou" }
        } finally {
            if ($agentProbeLocationPushed) { Pop-Location }
        }
    }

    if ($RunNestedDelegationProbe) {
        $probe = Join-Path $PSScriptRoot "nested-delegation-smoke.ps1"
        $probeArgs = @("-NoProfile","-ExecutionPolicy","Bypass","-File",$probe,"-Target",$Target)
        if (-not [string]::IsNullOrWhiteSpace($Model)) { $probeArgs += @("-Model",$Model) }
        $hostExe = Resolve-PowerShellHost
        & $hostExe @probeArgs
        if ($LASTEXITCODE -ne 0) { throw "NESTED_DELEGATION_FAILED: probe operacional falhou (exit=$LASTEXITCODE)" }
    }
} finally {
    $env:OPENCODE_CONFIG_DIR = $previous
}
$compatLabel = if ($null -eq $compatDepth) { "none" } else { "experimental=2" }
Write-Host "Runtime invariants: default_agent=orchestrator; subagent_depth(root)=2; compatibility=$compatLabel"
Write-Host "SUBAGENT_DEPTH_CONFIGURED"
if ($RunNestedDelegationProbe) { Write-Host "SUBAGENT_DEPTH_VALIDATED" }
Write-Host "Runtime smoke: OK"
