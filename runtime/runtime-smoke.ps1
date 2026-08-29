param(
    [string]$Target = (Join-Path $HOME ".config/opencode"),
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$RunAgentProbe,
    [string]$Model
)
$ErrorActionPreference = "Stop"

$requiredAgents = @("orchestrator","product-owner","project-manager","engineer","explorer","researcher","modeler","engineering-planner","tester","implementer","verifier","debugger","reviewer","security-reviewer","integrator","documenter")
foreach ($name in $requiredAgents) {
    $p = Join-Path (Join-Path $Target "agents") "$name.md"
    if (-not (Test-Path -LiteralPath $p)) { throw "Agent ausente: $p" }
}
$skill = Join-Path (Join-Path (Join-Path $Target "skills") "ai-driven-engineering") "SKILL.md"
if (-not (Test-Path -LiteralPath $skill)) { throw "Skill ausente: $skill" }

# Preferir o CLI V2 (opencode2) quando disponível; o binário `opencode` V1 não entende
# a config V2 (ex.: subagent_depth na raiz) e reportaria "Configuration is invalid".
$oc = Get-Command opencode2 -ErrorAction SilentlyContinue
$ocName = "opencode2"
if ($null -eq $oc) {
    $oc = Get-Command opencode -ErrorAction SilentlyContinue
    $ocName = "opencode"
}
if ($null -eq $oc) {
    Write-Host "OpenCode CLI não encontrado; layout local OK, config/runtime não puderam ser exercitados."
    exit 0
}

Write-Host "OpenCode: $(& $ocName --version)"
$previous = $env:OPENCODE_CONFIG_DIR
try {
    $env:OPENCODE_CONFIG_DIR = $Target
    $resolved = & $ocName debug config 2>&1
    if ($LASTEXITCODE -ne 0) { throw "$ocName debug config falhou: $resolved" }
    $joined = ($resolved | Out-String)
    if ($joined -notmatch 'orchestrator') { throw "Config resolvida não referencia orchestrator" }
    if ($joined -notmatch 'subagent_depth') { Write-Host "WARN: saída de debug config não expôs subagent_depth textualmente." }

    if ($RunAgentProbe) {
        $args = @('run','--agent','orchestrator','--dir',$ProjectRoot,'--format','json')
        if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
        $args += @('Responda somente com RUNTIME_OK e não use ferramentas.')
        & $ocName @args
        if ($LASTEXITCODE -ne 0) { throw "Probe do orchestrator falhou" }
    }
} finally {
    $env:OPENCODE_CONFIG_DIR = $previous
}
Write-Host "Runtime smoke: OK"
