param(
    [string]$Target = "$HOME\.config\opencode"
)

$ErrorActionPreference = "Stop"

$AgentNames = @(
    "orchestrator","product-owner","project-manager","engineer",
    "explorer","researcher","modeler","engineering-planner",
    "tester","implementer","verifier","debugger","reviewer",
    "security-reviewer","integrator","documenter"
)

foreach ($name in $AgentNames) {
    $path = Join-Path $Target "agents\$name.md"
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "Removed $path"
    }
}

$skill = Join-Path $Target "skills\ai-driven-engineering"
if (Test-Path $skill) {
    Remove-Item $skill -Recurse -Force
    Write-Host "Removed $skill"
}

Write-Host ""
Write-Host "Agent and skill files removed."
Write-Host "Config keys default_agent/subagent_depth were not automatically reverted."
Write-Host "Use the installer's timestamped config backup if you want to restore the prior config exactly."
