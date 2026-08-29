param(
    [string]$Target = "$HOME\.config\opencode",
    [switch]$NoDefaultAgent,
    [switch]$NoConfigPatch,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Backup-File([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$Path.ai-driven-backup-$stamp"
    Copy-Item $Path $backup -Force
    return $backup
}

function Set-TopLevelJsoncScalar(
    [string]$Text,
    [string]$Name,
    [string]$JsonLiteral
) {
    $pattern = '(?m)(["'']?' + [regex]::Escape($Name) + '["'']?\s*:\s*)(?:"(?:[^"\\]|\\.)*"|\d+|true|false|null)'
    if ([regex]::IsMatch($Text, $pattern)) {
        return [regex]::Replace($Text, $pattern, ('$1' + $JsonLiteral), 1)
    }

    $brace = $Text.IndexOf('{')
    if ($brace -lt 0) {
        throw "Config does not contain a root JSON object."
    }

    $insert = "`r`n  `"$Name`": $JsonLiteral,"
    return $Text.Insert($brace + 1, $insert)
}

function Find-MatchingJsoncBrace(
    [string]$Text,
    [int]$OpenIndex
) {
    $depth = 0
    $inString = $false
    $escape = $false
    $lineComment = $false
    $blockComment = $false

    for ($i = $OpenIndex; $i -lt $Text.Length; $i++) {
        $ch = $Text[$i]
        $next = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }

        if ($lineComment) {
            if ($ch -eq "`n") { $lineComment = $false }
            continue
        }

        if ($blockComment) {
            if ($ch -eq '*' -and $next -eq '/') {
                $blockComment = $false
                $i++
            }
            continue
        }

        if ($inString) {
            if ($escape) {
                $escape = $false
                continue
            }
            if ($ch -eq '\') {
                $escape = $true
                continue
            }
            if ($ch -eq '"') {
                $inString = $false
            }
            continue
        }

        if ($ch -eq '/' -and $next -eq '/') {
            $lineComment = $true
            $i++
            continue
        }

        if ($ch -eq '/' -and $next -eq '*') {
            $blockComment = $true
            $i++
            continue
        }

        if ($ch -eq '"') {
            $inString = $true
            continue
        }

        if ($ch -eq '{') {
            $depth++
            continue
        }

        if ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $i
            }
        }
    }

    return -1
}

function Set-V2SubagentDepth(
    [string]$Text,
    [int]$Depth
) {
    # Native V2 beta location: experimental.subagent_depth
    $experimentalPattern = '(?m)"experimental"\s*:\s*\{'
    $m = [regex]::Match($Text, $experimentalPattern)

    if (-not $m.Success) {
        $root = $Text.IndexOf('{')
        if ($root -lt 0) {
            throw "Config does not contain a root JSON object."
        }

        $insert = "`r`n  `"experimental`": { `"subagent_depth`": $Depth },"
        return $Text.Insert($root + 1, $insert)
    }

    $openIndex = $Text.IndexOf('{', $m.Index)
    $closeIndex = Find-MatchingJsoncBrace $Text $openIndex

    if ($closeIndex -lt 0) {
        throw "Could not find the closing brace for the experimental config object."
    }

    $prefix = $Text.Substring(0, $openIndex + 1)
    $body = $Text.Substring($openIndex + 1, $closeIndex - $openIndex - 1)
    $suffix = $Text.Substring($closeIndex)

    $depthPattern = '(?m)(["'']?subagent_depth["'']?\s*:\s*)\d+'

    if ([regex]::IsMatch($body, $depthPattern)) {
        $body = [regex]::Replace($body, $depthPattern, ('$1' + $Depth), 1)
    } else {
        $body = "`r`n    `"subagent_depth`": $Depth," + $body
    }

    return $prefix + $body + $suffix
}

Write-Host "Installing AI-Driven Product Delivery into: $Target"

New-Item -ItemType Directory -Force -Path (Join-Path $Target "agents") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Target "skills\ai-driven-engineering") | Out-Null

Copy-Item (Join-Path $PackageRoot "agents\*.md") (Join-Path $Target "agents") -Force

$SkillTarget = Join-Path $Target "skills\ai-driven-engineering"
if ((Test-Path $SkillTarget) -and $Force) {
    Remove-Item $SkillTarget -Recurse -Force
    New-Item -ItemType Directory -Force -Path $SkillTarget | Out-Null
}
Copy-Item (Join-Path $PackageRoot "skills\ai-driven-engineering\*") $SkillTarget -Recurse -Force

if (-not $NoConfigPatch) {
    $jsonc = Join-Path $Target "opencode.jsonc"
    $json  = Join-Path $Target "opencode.json"

    if (Test-Path $jsonc) {
        $ConfigPath = $jsonc
    } elseif (Test-Path $json) {
        $ConfigPath = $json
    } else {
        $ConfigPath = $jsonc
        Set-Content -Path $ConfigPath -Value "{`r`n}" -Encoding UTF8
    }

    $backup = Backup-File $ConfigPath
    if ($backup) {
        Write-Host "Config backup: $backup"
    }

    $text = Get-Content $ConfigPath -Raw

    # OpenCode V2 beta: top-level subagent_depth is ignored;
    # the supported location is experimental.subagent_depth.
    $text = Set-V2SubagentDepth $text 2

    if (-not $NoDefaultAgent) {
        $text = Set-TopLevelJsoncScalar $text "default_agent" '"orchestrator"'
    }

    Set-Content -Path $ConfigPath -Value $text -Encoding UTF8
    Write-Host "Patched config in-place while preserving existing provider/MCP content: $ConfigPath"
}

Write-Host ""
Write-Host "Installed control agents:"
foreach ($name in @("orchestrator","product-owner","project-manager","engineer")) {
    Write-Host "  - $name"
}

Write-Host ""
Write-Host "Installed engineering specialists:"
foreach ($name in @(
    "explorer","researcher","modeler","engineering-planner",
    "tester","implementer","verifier","debugger","reviewer",
    "security-reviewer","integrator","documenter"
)) {
    Write-Host "  - $name"
}

Write-Host ""
Write-Host "Installed skill: ai-driven-engineering"
Write-Host "experimental.subagent_depth: 2"
if (-not $NoDefaultAgent) {
    Write-Host "default_agent: orchestrator"
}

Write-Host ""
Write-Host "Optional project bootstrap:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PackageRoot\scripts\bootstrap-project.ps1`""
Write-Host ""
Write-Host "Restart OpenCode / OpenCode V2 or start a new session so discovery reloads the installed files."
