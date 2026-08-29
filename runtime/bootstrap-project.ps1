param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$WorkItemId = "WORK-001",
    [ValidateSet("LEAN", "STANDARD", "HIGH_ASSURANCE")]
    [string]$Profile = "STANDARD",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$RuntimeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageLikeRoot = Split-Path -Parent $RuntimeRoot
$SkillTemplates = Join-Path $PackageLikeRoot "skills/ai-driven-engineering/templates"
if (-not (Test-Path -LiteralPath $SkillTemplates)) {
    $SkillTemplates = Join-Path (Split-Path -Parent $PackageLikeRoot) "skills/ai-driven-engineering/templates"
}
if (-not (Test-Path -LiteralPath $SkillTemplates)) {
    throw "Templates da skill ai-driven-engineering não foram encontrados a partir de: $RuntimeRoot"
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "Projeto não encontrado: $ProjectRoot" }
$ai = Join-Path $ProjectRoot ".ai"
if (-not (Test-Path -LiteralPath $ai)) { New-Item -ItemType Directory -Path $ai -Force | Out-Null }

$map = [ordered]@{
    "product-contract.md"     = "product-contract.md"
    "delivery-contract.md"    = "delivery-contract.md"
    "engineering-contract.md" = "engineering-contract.md"
    "checkpoint.md"           = "checkpoint.md"
    "decision-log.md"         = "decision-log.md"
    "execution-policy.md"     = "execution-policy.md"
    "execution-policy.json"   = "execution-policy.json"
    "control.json"            = "control.json"
    "integrations.json"       = "integrations.json"
    "traceability.json"       = "traceability.json"
}

foreach ($entry in $map.GetEnumerator()) {
    $src = Join-Path $SkillTemplates $entry.Value
    $dst = Join-Path $ai $entry.Key
    if ((Test-Path -LiteralPath $dst) -and -not $Force) {
        Write-Host "Preservado: $dst"
        continue
    }
    $content = [System.IO.File]::ReadAllText($src)
    $content = $content.Replace("{{WORK_ITEM_ID}}", $WorkItemId)
    $content = $content.Replace("{{TIMESTAMP}}", [DateTime]::UtcNow.ToString("o"))
    if ($entry.Key -eq "control.json") {
        $obj = $content | ConvertFrom-Json
        $obj.work_item_id = $WorkItemId
        $obj.profile = $Profile
        $obj.updated_at = [DateTime]::UtcNow.ToString("o")
        if ($Profile -eq "LEAN") {
            $obj.product.required = $false
            $obj.delivery.required = $false
        }
        $content = ($obj | ConvertTo-Json -Depth 10) + [Environment]::NewLine
    }
    Write-Utf8NoBom $dst $content
    Write-Host "Criado: $dst"
}

$workItems = Join-Path $ai "work-items"
if (-not (Test-Path -LiteralPath $workItems)) {
    New-Item -ItemType Directory -Path $workItems -Force | Out-Null
    Write-Host "Criado: $workItems"
}
$audit = Join-Path $ai "audit.jsonl"
if (-not (Test-Path -LiteralPath $audit)) {
    Write-Utf8NoBom $audit ""
    Write-Host "Criado: $audit"
}

$delegations = Join-Path $ai "delegations"
if (-not (Test-Path -LiteralPath $delegations)) {
    New-Item -ItemType Directory -Path $delegations -Force | Out-Null
    Write-Host "Criado: $delegations"
}

Write-Host ""
Write-Host "Bootstrap concluído."
Write-Host "Estado canônico: $(Join-Path $ai 'control.json')"
Write-Host "Valide com: pwsh -File `"$(Join-Path $RuntimeRoot 'validate-ai-state.ps1')`" -ProjectRoot `"$ProjectRoot`""
