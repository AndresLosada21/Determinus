param(
    [string]$Target,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($Target)) {
    $Target = Join-Path $HOME ".config/opencode"
}

function Get-NormalizedFullPath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($fullPath)
    if ($fullPath.Length -gt $root.Length) {
        $fullPath = $fullPath.TrimEnd([char[]]@('\', '/'))
    }
    return $fullPath
}

function Read-Utf8File([string]$Path) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    return [System.IO.File]::ReadAllText($Path, $utf8NoBom)
}

function Test-FileContentMatch([string]$Left, [string]$Right) {
    if (-not (Test-Path -LiteralPath $Left) -or -not (Test-Path -LiteralPath $Right)) { return $false }
    return (Get-FileHash -LiteralPath $Left -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $Right -Algorithm SHA256).Hash
}

function Get-RelativeFilePath([string]$Root, [string]$Path) {
    $rootPath = Get-NormalizedFullPath $Root
    $fullPath = Get-NormalizedFullPath $Path
    if ($fullPath.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase)) { return "" }
    return $fullPath.Substring($rootPath.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
}

function Test-SafeRelativePath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -match '^[\\/]' -or $Path -match ':' -or $Path -match '[\*\?\[\]]') {
        return $false
    }

    foreach ($segment in $Path -split '[\\/]') {
        if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq "..") {
            return $false
        }
    }

    return $true
}

function Test-ItemIsLink($Item) {
    if ($null -ne $Item.Attributes -and (([int]$Item.Attributes -band [int][System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
        return $true
    }
    $linkType = $Item.PSObject.Properties["LinkType"]
    if ($null -ne $linkType -and -not [string]::IsNullOrWhiteSpace([string]$linkType.Value)) {
        return $true
    }

    $target = $Item.PSObject.Properties["Target"]
    return $null -ne $target -and -not [string]::IsNullOrWhiteSpace([string]$target.Value)
}

function Assert-SafePathChain([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $fullPath = Get-NormalizedFullPath $Path
    $current = $fullPath
    while ($true) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (Test-ItemIsLink $item) {
                throw "Reparse point detectado em: $current. Operação abortada por segurança."
            }
        }
        $parent = Split-Path -Parent $current
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) { break }
        $current = $parent
    }
}

function Test-RelativePathHasNoLinks([string]$Root, [string]$Relative) {
    if (-not (Test-SafeRelativePath $Relative)) { return $false }
    Assert-SafePathChain $Root
    if ((Test-Path -LiteralPath $Root) -and (Test-ItemIsLink (Get-Item -LiteralPath $Root -Force))) { return $false }

    $current = $Root
    foreach ($segment in $Relative -split '[\\/]') {
        $current = Join-Path $current $segment
        if (-not (Test-Path -LiteralPath $current)) { return $true }
        if (Test-ItemIsLink (Get-Item -LiteralPath $current -Force)) { return $false }
    }

    return $true
}

function Test-DirectoryTreeHasNoLinks([string]$Directory) {
    if (-not (Test-Path -LiteralPath $Directory)) { return $true }
    Assert-SafePathChain $Directory
    if (Test-ItemIsLink (Get-Item -LiteralPath $Directory -Force)) { return $false }

    foreach ($item in @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)) {
        if (Test-ItemIsLink $item) { return $false }
    }

    return $true
}

function Get-DirectoryRelativePaths([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    return @(Get-ChildItem $Path -Recurse -Directory -Force | Sort-Object FullName | ForEach-Object {
        Get-RelativeFilePath $Path $_.FullName
    })
}

function Read-InstallManifest([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    Assert-SafePathChain $Path
    if (Test-ItemIsLink (Get-Item -LiteralPath $Path -Force)) {
        throw "Manifesto é link simbólico ou junction: $Path"
    }
    try {
        $manifest = Read-Utf8File $Path | ConvertFrom-Json
        if (@(1, 2, 3, 4) -notcontains [int]($manifest.schema_version) -or $null -eq $manifest.agents -or $null -eq $manifest.skill) {
            throw "schema_version ou seções obrigatórias ausentes"
        }
        return $manifest
    } catch {
        Write-Host "Manifesto de instalação inválido; será preservado e a remoção segura usará comparação com o pacote atual."
        return $null
    }
}

function Test-DirectoryMatchesManifest([string]$Directory, $Skill, [int]$SchemaVersion) {
    if (-not (Test-Path -LiteralPath $Directory) -or $null -eq $Skill) { return $false }
    Assert-SafePathChain $Directory
    if (-not (Test-DirectoryTreeHasNoLinks $Directory)) { return $false }

    $entries = if ($SchemaVersion -ge 2) { $Skill.files } else { $Skill }
    if ($null -eq $entries) { return $false }

    $properties = @($Entries.PSObject.Properties)
    $files = @(Get-ChildItem -LiteralPath $Directory -Recurse -File -Force)
    if ($properties.Count -ne $files.Count) { return $false }

    foreach ($property in $properties) {
        $relative = $property.Name
        if (-not (Test-SafeRelativePath $relative)) { return $false }
        $path = Join-Path $Directory ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        Assert-SafePathChain $path
        if (-not (Test-RelativePathHasNoLinks $Directory $relative)) { return $false }
        if (Test-ItemIsLink (Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue)) { return $false }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne [string]$property.Value) { return $false }
    }

    if ($SchemaVersion -ge 2) {
        $expectedDirectories = @($Skill.directories)
        $actualDirectories = @(Get-DirectoryRelativePaths $Directory)
        if ($expectedDirectories.Count -ne $actualDirectories.Count) { return $false }
        foreach ($relative in $expectedDirectories) {
            if (-not (Test-SafeRelativePath $relative) -or $actualDirectories -notcontains $relative) {
                return $false
            }
        }
    }

    return $true
}

function Remove-ManagedAmbientBlock([string]$Text) {
    $begin = "<!-- AI-DRIVEN-ENGINEERING:BEGIN v4 -->"
    $end = "<!-- AI-DRIVEN-ENGINEERING:END v4 -->"
    $start = $Text.IndexOf($begin, [StringComparison]::Ordinal)
    if ($start -lt 0) { return $Text }
    $finish = $Text.IndexOf($end, $start, [StringComparison]::Ordinal)
    if ($finish -lt 0) { return $Text }
    $finish += $end.Length
    $result = $Text.Remove($start, $finish - $start)
    return $result.TrimEnd() + $(if ([string]::IsNullOrWhiteSpace($result)) { "" } else { [Environment]::NewLine })
}

function Write-Utf8File([string]$Path, [string]$Content) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$AgentDirectory = Join-Path $Target "agents"
$SkillDirectory = Join-Path (Join-Path $Target "skills") "ai-driven-engineering"
$RuntimeDirectory = Join-Path (Join-Path $Target "ai-driven-engineering") "runtime"
$AmbientPath = Join-Path $Target "AGENTS.md"
$ManifestPath = Join-Path $Target "ai-driven-engineering-install.json"

Assert-SafePathChain $Target
Assert-SafePathChain $AgentDirectory
Assert-SafePathChain $SkillDirectory
Assert-SafePathChain $RuntimeDirectory
Assert-SafePathChain $AmbientPath
Assert-SafePathChain $ManifestPath

$Manifest = Read-InstallManifest $ManifestPath
$AgentSource = Join-Path $PackageRoot "agents"
$AgentEntries = @()
if ($Manifest) {
    foreach ($property in @($Manifest.agents.PSObject.Properties)) {
        if (Test-SafeRelativePath $property.Name) {
            $AgentEntries += [PSCustomObject]@{
                Relative = $property.Name
                Hash = [string]$property.Value
            }
        }
    }
    if ([int]($Manifest.schema_version) -ge 3 -and $null -ne $Manifest.preserved_obsolete_agents) {
        foreach ($property in @($Manifest.preserved_obsolete_agents.PSObject.Properties)) {
            if (-not (Test-SafeRelativePath $property.Name)) { continue }
            $exists = $false
            foreach ($e in $AgentEntries) { if ($e.Relative -eq $property.Name) { $exists = $true; break } }
            if (-not $exists) {
                $AgentEntries += [PSCustomObject]@{
                    Relative = $property.Name
                    Hash = [string]$property.Value
                }
            }
        }
    }
} else {
    foreach ($sourceAgent in @(Get-ChildItem -LiteralPath $AgentSource -Recurse -File -Force)) {
        $AgentEntries += [PSCustomObject]@{
            Relative = Get-RelativeFilePath $AgentSource $sourceAgent.FullName
            Hash = $null
        }
    }
}
$removedAgents = 0
$preservedAgents = 0
$hasPreservedContent = $false

foreach ($entry in $AgentEntries) {
    $path = Join-Path $AgentDirectory ($entry.Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $path)) { continue }
    Assert-SafePathChain $path
    if (-not (Test-RelativePathHasNoLinks $AgentDirectory $entry.Relative)) {
        $preservedAgents++
        $hasPreservedContent = $true
        Write-Host "Preservado por conter link simbólico ou junction: $path"
        continue
    }
    if (Test-ItemIsLink (Get-Item -LiteralPath $path -Force)) {
        $preservedAgents++
        $hasPreservedContent = $true
        Write-Host "Preservado por ser link simbólico ou junction: $path"
        continue
    }

    $source = Join-Path $AgentSource ($entry.Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    $matches = if ($entry.Hash) {
        (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $entry.Hash
    } else {
        Test-FileContentMatch $source $path
    }

    if ($Force -or $matches) {
        Assert-SafePathChain $path
        Assert-SafePathChain $AgentDirectory
        Remove-Item -LiteralPath $path -Force
        $removedAgents++
        Write-Host "Removido: $path"
    } else {
        $preservedAgents++
        $hasPreservedContent = $true
        Write-Host "Preservado por conter alterações locais ou pertencer a outra versão: $path"
    }
}

$skillRemoved = $false
$skillPreserved = $false
if (Test-Path -LiteralPath $SkillDirectory) {
    Assert-SafePathChain $SkillDirectory
    $source = Join-Path (Join-Path $PackageRoot "skills") "ai-driven-engineering"
    $matches = $false
    if ($Manifest) {
        $matches = Test-DirectoryMatchesManifest $SkillDirectory $Manifest.skill ([int]($Manifest.schema_version))
    }

    if (-not $Manifest) {
        $sourceFiles = @(Get-ChildItem -LiteralPath $source -Recurse -File -Force)
        $targetFiles = @(Get-ChildItem -LiteralPath $SkillDirectory -Recurse -File -Force)
        $matches = $sourceFiles.Count -eq $targetFiles.Count
        if ($matches) {
            foreach ($sourceFile in $sourceFiles) {
                $relative = Get-RelativeFilePath $source $sourceFile.FullName
                $targetFile = Join-Path $SkillDirectory ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
                Assert-SafePathChain $targetFile
                if (-not (Test-FileContentMatch $sourceFile.FullName $targetFile)) {
                    $matches = $false
                    break
                }
            }
        }
        if ($matches) {
            $sourceDirectories = @(Get-DirectoryRelativePaths $source)
            $targetDirectories = @(Get-DirectoryRelativePaths $SkillDirectory)
            if ($sourceDirectories.Count -ne $targetDirectories.Count) {
                $matches = $false
            } else {
                foreach ($relative in $sourceDirectories) {
                    if ($targetDirectories -notcontains $relative) {
                        $matches = $false
                        break
                    }
                }
            }
        }
    }

    Assert-SafePathChain $SkillDirectory
    if (($Force -or $matches) -and (Test-DirectoryTreeHasNoLinks $SkillDirectory)) {
        Assert-SafePathChain $SkillDirectory
        Assert-SafePathChain $Target
        Remove-Item -LiteralPath $SkillDirectory -Recurse -Force
        $skillRemoved = $true
        Write-Host "Removida: $SkillDirectory"
    } else {
        $skillPreserved = $true
        $hasPreservedContent = $true
        Write-Host "Skill preservada por conter alterações locais, arquivos extras, outra versão, link simbólico ou junction: $SkillDirectory"
    }
}

# Runtime determinístico
$runtimeRemoved = $false
$runtimePreserved = $false
if (Test-Path -LiteralPath $RuntimeDirectory) {
    $runtimeMatches = $false
    if ($Manifest -and [int]($Manifest.schema_version) -ge 4 -and $null -ne $Manifest.runtime) {
        $runtimeMatches = Test-DirectoryMatchesManifest $RuntimeDirectory $Manifest.runtime ([int]($Manifest.schema_version))
    } elseif (-not $Manifest) {
        $runtimeSource = Join-Path $PackageRoot "runtime"
        if (Test-Path -LiteralPath $runtimeSource) {
            $runtimeMatches = Test-DirectoryTreeHasNoLinks $RuntimeDirectory
            if ($runtimeMatches) {
                $srcFiles = @(Get-ChildItem -LiteralPath $runtimeSource -Recurse -File -Force)
                $dstFiles = @(Get-ChildItem -LiteralPath $RuntimeDirectory -Recurse -File -Force)
                if ($srcFiles.Count -ne $dstFiles.Count) { $runtimeMatches = $false }
                foreach ($f in $srcFiles) {
                    if (-not $runtimeMatches) { break }
                    $rel = Get-RelativeFilePath $runtimeSource $f.FullName
                    $dst = Join-Path $RuntimeDirectory ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
                    if (-not (Test-FileContentMatch $f.FullName $dst)) { $runtimeMatches = $false }
                }
            }
        }
    }
    if (($Force -or $runtimeMatches) -and (Test-DirectoryTreeHasNoLinks $RuntimeDirectory)) {
        Remove-Item -LiteralPath $RuntimeDirectory -Recurse -Force
        $runtimeRemoved = $true
        $runtimeBase = Split-Path -Parent $RuntimeDirectory
        if ((Test-Path -LiteralPath $runtimeBase) -and @(Get-ChildItem -LiteralPath $runtimeBase -Force).Count -eq 0) { Remove-Item -LiteralPath $runtimeBase -Force }
        Write-Host "Runtime removido: $RuntimeDirectory"
    } else {
        $runtimePreserved = $true
        $hasPreservedContent = $true
        Write-Host "Runtime preservado por conter alterações locais."
    }
}

# Reverte a configuração somente se ela ainda for exatamente a escrita pelo instalador.
if ($Manifest -and [int]($Manifest.schema_version) -ge 4 -and $null -ne $Manifest.config -and $Manifest.config.changed_by_installer) {
    $cfg = $Manifest.config
    $cfgPath = [string]$cfg.path
    if (-not [string]::IsNullOrWhiteSpace($cfgPath) -and (Test-Path -LiteralPath $cfgPath)) {
        Assert-SafePathChain $cfgPath
        $currentHash = (Get-FileHash -LiteralPath $cfgPath -Algorithm SHA256).Hash
        if ($currentHash -eq [string]$cfg.installed_hash) {
            if ($cfg.existed_before -and -not [string]::IsNullOrWhiteSpace([string]$cfg.backup_path) -and (Test-Path -LiteralPath ([string]$cfg.backup_path))) {
                Assert-SafePathChain ([string]$cfg.backup_path)
                Copy-Item -LiteralPath ([string]$cfg.backup_path) -Destination $cfgPath -Force
                Write-Host "Configuração anterior restaurada: $cfgPath"
            } elseif (-not $cfg.existed_before) {
                Remove-Item -LiteralPath $cfgPath -Force
                Write-Host "Configuração criada pelo instalador removida: $cfgPath"
            }
        } else {
            $hasPreservedContent = $true
            Write-Host "Configuração preservada: mudou após a instalação; nenhuma reversão automática foi feita."
        }
    }
}

# Remove/restaura somente o bloco ambient da v4, preservando alterações alheias.
if ($Manifest -and [int]($Manifest.schema_version) -ge 4 -and $null -ne $Manifest.ambient -and $Manifest.ambient.changed_by_installer -and (Test-Path -LiteralPath $AmbientPath)) {
    Assert-SafePathChain $AmbientPath
    $ambientCurrent = Read-Utf8File $AmbientPath
    $ambientHash = (Get-FileHash -LiteralPath $AmbientPath -Algorithm SHA256).Hash
    if ($ambientHash -eq [string]$Manifest.ambient.installed_hash -and $Manifest.ambient.existed_before -and -not [string]::IsNullOrWhiteSpace([string]$Manifest.ambient.backup_path) -and (Test-Path -LiteralPath ([string]$Manifest.ambient.backup_path))) {
        Copy-Item -LiteralPath ([string]$Manifest.ambient.backup_path) -Destination $AmbientPath -Force
        Write-Host "AGENTS.md anterior restaurado."
    } else {
        $cleaned = Remove-ManagedAmbientBlock $ambientCurrent
        if ([string]::IsNullOrWhiteSpace($cleaned) -and -not $Manifest.ambient.existed_before) {
            Remove-Item -LiteralPath $AmbientPath -Force
            Write-Host "AGENTS.md criado pela v4 removido."
        } elseif (-not $cleaned.Equals($ambientCurrent, [StringComparison]::Ordinal)) {
            Write-Utf8File $AmbientPath $cleaned
            Write-Host "Bloco ambient da v4 removido de AGENTS.md."
        } else {
            $hasPreservedContent = $true
            Write-Host "AGENTS.md preservado: bloco gerenciado não foi encontrado como esperado."
        }
    }
}

if ((Test-Path -LiteralPath $ManifestPath) -and ($Force -or -not $hasPreservedContent)) {
    Assert-SafePathChain $ManifestPath
    Assert-SafePathChain $Target
    if (Test-ItemIsLink (Get-Item -LiteralPath $ManifestPath -Force)) {
        throw "Manifesto é reparse point, não pode ser removido com segurança: $ManifestPath"
    }
    Remove-Item -LiteralPath $ManifestPath -Force
    Write-Host "Manifesto de instalação removido: $ManifestPath"
}

Write-Host ""
Write-Host "Agents removidos: $removedAgents. Agents preservados: $preservedAgents."
if ($skillRemoved) {
    Write-Host "Skill removida."
} elseif ($skillPreserved) {
    Write-Host "Skill preservada. Use -Force apenas se quiser descartar alterações locais."
} else {
    Write-Host "Nenhuma skill correspondente foi encontrada."
}
if ($Manifest -and [int]($Manifest.schema_version) -ge 4) {
    Write-Host "Config/AGENTS.md: reversão segura aplicada quando possível; alterações posteriores do usuário são preservadas."
} else {
    Write-Host "Instalação legada detectada: revise a configuração manualmente se default_agent/subagent_depth permanecerem."
}
