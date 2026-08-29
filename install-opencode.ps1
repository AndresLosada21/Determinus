param(
    [string]$Target,
    [switch]$NoDefaultAgent,
    [switch]$NoConfigPatch,
    [switch]$NoAmbientInstructions,
    [switch]$SkipRuntimeCheck,
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

function Test-PathIsWithin([string]$Child, [string]$Parent) {
    $comparison = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        [StringComparison]::OrdinalIgnoreCase
    } else {
        [StringComparison]::Ordinal
    }
    $childPath = Get-NormalizedFullPath $Child
    $parentPath = Get-NormalizedFullPath $Parent
    if ($childPath.Equals($parentPath, $comparison)) { return $true }

    $separator = [IO.Path]::DirectorySeparatorChar
    $prefix = if ($parentPath.EndsWith([string]$separator)) { $parentPath } else { $parentPath + $separator }
    return $childPath.StartsWith($prefix, $comparison)
}

$DefaultTarget = Join-Path $HOME ".config/opencode"
$DefaultBackupBase = Join-Path $DefaultTarget ".ai-driven-backups"
$ExternalBackupBase = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $localAppData = if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { Join-Path $HOME "AppData/Local" } else { $env:LOCALAPPDATA }
    Join-Path (Join-Path $localAppData "opencode") "ai-driven-backups"
} else {
    $stateHome = if ([string]::IsNullOrWhiteSpace($env:XDG_STATE_HOME)) { Join-Path $HOME ".local/state" } else { $env:XDG_STATE_HOME }
    Join-Path (Join-Path $stateHome "opencode") "ai-driven-backups"
}

$BackupBase = if ((Test-PathIsWithin $Target $DefaultTarget) -and (Test-PathIsWithin $DefaultTarget $Target)) {
    $DefaultBackupBase
} elseif (-not (Test-PathIsWithin $ExternalBackupBase $Target)) {
    $ExternalBackupBase
} elseif (-not (Test-PathIsWithin $DefaultBackupBase $Target)) {
    $DefaultBackupBase
} else {
    throw "Não há uma pasta privada de backup fora de -Target. Use um destino mais específico ou faça backup manual antes de instalar."
}
$BackupRoot = Join-Path $BackupBase ((Get-Date -Format "yyyyMMdd-HHmmssfff") + "-" + [Guid]::NewGuid().ToString("N"))

$script:BackedUpSources = @{}
$script:PreservedObsoleteAgents = [ordered]@{}

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

function New-SafeDirectory([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw "Caminho de diretório vazio" }
    $parent = Split-Path -Parent (Get-NormalizedFullPath $Path)
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        Assert-SafePathChain $parent
        if (-not (Test-Path -LiteralPath $parent)) {
            New-SafeDirectory $parent
        }
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    } else {
        $existing = Get-Item -LiteralPath $Path -Force
        if (-not $existing.PSIsContainer) { throw "Caminho existe e não é diretório: $Path" }
    }
    $itemAfter = Get-Item -LiteralPath $Path -Force
    if (Test-ItemIsLink $itemAfter) {
        throw "Diretório é reparse point: $Path"
    }
    Assert-SafePathChain $Path
}

function Get-BackupPath([string]$Path) {
    Assert-SafePathChain $BackupBase
    Assert-SafePathChain $BackupRoot
    $targetRoot = Get-NormalizedFullPath $Target
    $sourcePath = Get-NormalizedFullPath $Path
    if (-not (Test-PathIsWithin $sourcePath $targetRoot)) {
        throw "O arquivo de backup está fora do destino da instalação: $Path"
    }
    $relative = if ($sourcePath.Equals($targetRoot, [StringComparison]::OrdinalIgnoreCase)) {
        ""
    } else {
        $sourcePath.Substring($targetRoot.Length).TrimStart([char[]]@('\', '/'))
    }
    if ([string]::IsNullOrWhiteSpace($relative)) {
        throw "Origem de backup não pode ser o próprio diretório de destino: $Path"
    }
    $backup = Join-Path $BackupRoot $relative
    $backupFull = Get-NormalizedFullPath $backup
    if (Test-PathIsWithin $backupFull $sourcePath -or Test-PathIsWithin $sourcePath $backupFull -or $backupFull.Equals($sourcePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Destino de backup sobrepõe a origem: $Path -> $backup"
    }
    $backupParent = Split-Path -Parent $backupFull
    if (-not [string]::IsNullOrWhiteSpace($backupParent)) {
        Assert-SafePathChain $backupParent
    }
    return $backup
}

function Backup-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $normalized = Get-NormalizedFullPath $Path
    if ($script:BackedUpSources.ContainsKey($normalized)) {
        return $script:BackedUpSources[$normalized]
    }
    Assert-SafePathChain $Path
    Assert-SafePathChain $BackupBase
    if (Test-Path -LiteralPath $Path) {
        $it = Get-Item -LiteralPath $Path -Force
        if (Test-ItemIsLink $it) { throw "Origem de backup é reparse point: $Path" }
    }
    $backup = Get-BackupPath $Path
    $backupParent = Split-Path -Parent $backup
    New-SafeDirectory $backupParent
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    if (-not (Test-FileContentMatch $Path $backup)) {
        throw "Falha ao verificar backup do arquivo: $Path"
    }
    $script:BackedUpSources[$normalized] = $backup
    return $backup
}

function Write-Utf8File([string]$Path, [string]$Content) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Read-Utf8File([string]$Path) {
    Assert-SafePathChain $Path
    if ((Test-Path -LiteralPath $Path) -and (Test-ItemIsLink (Get-Item -LiteralPath $Path -Force))) {
        throw "Arquivo é reparse point: $Path"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    return [System.IO.File]::ReadAllText($Path, $utf8NoBom)
}

function Initialize-BackupBase {
    Assert-SafePathChain $BackupBase
    New-SafeDirectory $BackupBase
    Assert-SafePathChain $BackupBase
}

function Backup-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $normalized = Get-NormalizedFullPath $Path
    if ($script:BackedUpSources.ContainsKey($normalized)) {
        return $script:BackedUpSources[$normalized]
    }
    Assert-SafePathChain $Path
    if (-not (Test-DirectoryTreeHasNoLinks $Path)) {
        throw "A pasta de origem do backup contém link simbólico ou junction: $Path"
    }
    Assert-SafePathChain $BackupBase
    $backup = Get-BackupPath $Path
    $backupParent = Split-Path -Parent $backup
    New-SafeDirectory $backupParent
    Copy-Item -LiteralPath $Path -Destination $backup -Recurse -Force
    if (-not (Test-DirectoryContentMatch $Path $backup)) {
        throw "Falha ao verificar backup do diretório: $Path"
    }
    $script:BackedUpSources[$normalized] = $backup
    return $backup
}

function Test-FileContentMatch([string]$Left, [string]$Right) {
    if (-not (Test-Path -LiteralPath $Left) -or -not (Test-Path -LiteralPath $Right)) { return $false }
    return (Get-FileHash -LiteralPath $Left -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $Right -Algorithm SHA256).Hash
}

function Test-DirectoryContentMatch([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source) -or -not (Test-Path -LiteralPath $Destination)) { return $false }

    $sourceFiles = @(Get-ChildItem $Source -Recurse -File -Force)
    $destinationFiles = @(Get-ChildItem $Destination -Recurse -File -Force)
    if ($sourceFiles.Count -ne $destinationFiles.Count) { return $false }

    foreach ($sourceFile in $sourceFiles) {
        $relative = Get-RelativeFilePath $Source $sourceFile.FullName
        $destinationFile = Join-Path $Destination $relative
        if (-not (Test-FileContentMatch $sourceFile.FullName $destinationFile)) { return $false }
    }

    $sourceDirectories = @(Get-DirectoryRelativePaths $Source)
    $destinationDirectories = @(Get-DirectoryRelativePaths $Destination)
    if ($sourceDirectories.Count -ne $destinationDirectories.Count) { return $false }
    foreach ($relative in $sourceDirectories) {
        if ($destinationDirectories -notcontains $relative) { return $false }
    }

    return $true
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

function Get-ManagedFileHashes(
    [string]$Source,
    [string]$Destination,
    [string]$Filter
) {
    $hashes = [ordered]@{}
    $sourceFiles = if ([string]::IsNullOrWhiteSpace($Filter)) {
        @(Get-ChildItem $Source -Recurse -File -Force)
    } else {
        @(Get-ChildItem $Source -Recurse -File -Force -Filter $Filter)
    }
    foreach ($sourceFile in @($sourceFiles | Sort-Object FullName)) {
        $relative = Get-RelativeFilePath $Source $sourceFile.FullName
        $destinationFile = Join-Path $Destination ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        Assert-SafePathChain $destinationFile
        if (-not (Test-Path -LiteralPath $destinationFile)) {
            throw "Arquivo instalado ausente ao criar o manifesto: $destinationFile"
        }
        if (Test-ItemIsLink (Get-Item -LiteralPath $destinationFile -Force)) { throw "Arquivo instalado é reparse point: $destinationFile" }
        $hashes[$relative] = (Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash
    }
    return $hashes
}

function Write-InstallManifest(
    [string]$Path,
    [string]$AgentSource,
    [string]$AgentTarget,
    [string]$SkillSource,
    [string]$SkillTarget,
    [string]$RuntimeSource,
    [string]$RuntimeTarget,
    $ConfigInfo,
    $AmbientInfo
) {
    $agents = Get-ManagedFileHashes $AgentSource $AgentTarget "*.md"
    $skillFiles = Get-ManagedFileHashes $SkillSource $SkillTarget $null
    $skillDirs = @(Get-DirectoryRelativePaths $SkillSource)
    $runtimeFiles = Get-ManagedFileHashes $RuntimeSource $RuntimeTarget $null
    $runtimeDirs = @(Get-DirectoryRelativePaths $RuntimeSource)
    $manifest = [ordered]@{
        schema_version = 4
        package_version = $PackageVersion
        agents = $agents
        skill = [ordered]@{ files = $skillFiles; directories = $skillDirs }
        runtime = [ordered]@{ files = $runtimeFiles; directories = $runtimeDirs }
        config = $ConfigInfo
        ambient = $AmbientInfo
    }
    if ($script:PreservedObsoleteAgents -and $script:PreservedObsoleteAgents.Count -gt 0) {
        $manifest.preserved_obsolete_agents = $script:PreservedObsoleteAgents
    }
    $json = ($manifest | ConvertTo-Json -Depth 6) + [Environment]::NewLine
    if (Test-Path -LiteralPath $Path) {
        Assert-SafePathChain $Path
        if (Test-ItemIsLink (Get-Item -LiteralPath $Path -Force)) { throw "Manifesto é reparse point: $Path" }
        $existing = Read-Utf8File $Path
        if ($json.Equals($existing, [StringComparison]::Ordinal)) { return $null }
        $backup = Backup-File $Path
        if ($backup) { Write-Host "Backup do manifesto de instalação: $backup" }
    }
    $dir = Split-Path -Parent $Path
    if ([string]::IsNullOrWhiteSpace($dir)) { $dir = $Target }
    New-SafeDirectory $dir
    $temp = Join-Path $dir (".tmp-manifest-" + [Guid]::NewGuid().ToString("N"))
    Write-Utf8File $temp $json
    Move-Item -LiteralPath $temp -Destination $Path -Force
    $written = Read-Utf8File $Path
    if (-not $written.Equals($json, [StringComparison]::Ordinal)) { throw "Falha ao verificar manifesto" }
    return $Path
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
        Write-Host "Manifesto de instalação existente inválido; arquivos gerenciados obsoletos serão preservados."
        return $null
    }
}

function Get-ManifestSkillFiles($Manifest) {
    if ($null -eq $Manifest) { return $null }
    if ([int]($Manifest.schema_version) -eq 2 -or [int]($Manifest.schema_version) -ge 3) {
        return $Manifest.skill.files
    }
    return $Manifest.skill
}

function Get-ManifestAgentFiles($Manifest) {
    if ($null -eq $Manifest) { return $null }
    return $Manifest.agents
}

function Remove-ObsoleteManagedAgents(
    [string]$Source,
    [string]$Destination,
    $Manifest,
    [switch]$Force
) {
    $entries = Get-ManifestAgentFiles $Manifest
    $allEntries = @()
    if ($null -ne $entries) {
        foreach ($property in @($entries.PSObject.Properties)) {
            $allEntries += [PSCustomObject]@{ Relative = $property.Name; Hash = [string]$property.Value }
        }
    }
    if ($null -ne $Manifest -and [int]($Manifest.schema_version) -ge 3 -and $null -ne $Manifest.preserved_obsolete_agents) {
        foreach ($property in @($Manifest.preserved_obsolete_agents.PSObject.Properties)) {
            $exists = $false
            foreach ($e in $allEntries) { if ($e.Relative -eq $property.Name) { $exists = $true; break } }
            if (-not $exists -and (Test-SafeRelativePath $property.Name)) {
                $allEntries += [PSCustomObject]@{ Relative = $property.Name; Hash = [string]$property.Value }
            }
        }
    }
    if ($allEntries.Count -eq 0) { return }

    foreach ($entry in $allEntries) {
        $relative = $entry.Relative
        if (-not (Test-SafeRelativePath $relative)) { continue }

        $sourceFile = Join-Path $Source ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (Test-Path -LiteralPath $sourceFile) { continue }

        $destinationFile = Join-Path $Destination ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $destinationFile)) { continue }
        Assert-SafePathChain $destinationFile
        if (-not (Test-RelativePathHasNoLinks $Destination $relative)) {
            $currentHash = (Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash
            if (-not $script:PreservedObsoleteAgents.Contains($relative)) {
                $script:PreservedObsoleteAgents[$relative] = $currentHash
            } else {
                $script:PreservedObsoleteAgents[$relative] = $currentHash
            }
            continue
        }
        $currentHash = (Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash
        $manifestHash = $entry.Hash
        if ($currentHash -eq $manifestHash) {
            Assert-SafePathChain $destinationFile
            Remove-Item -LiteralPath $destinationFile -Force
        } else {
            if ($Force) {
                Assert-SafePathChain $destinationFile
                Assert-SafePathChain $BackupBase
                $backup = Backup-File $destinationFile
                if (-not $backup) { throw "Falha ao criar backup antes de remover agent obsoleto modificado: $destinationFile" }
                Remove-Item -LiteralPath $destinationFile -Force
            } else {
                if (-not $script:PreservedObsoleteAgents.Contains($relative)) {
                    $script:PreservedObsoleteAgents[$relative] = $currentHash
                } else {
                    $script:PreservedObsoleteAgents[$relative] = $currentHash
                }
            }
        }
    }
}

function Remove-ObsoleteManagedSkillFiles(
    [string]$Source,
    [string]$Destination,
    $Manifest
) {
    $entries = Get-ManifestSkillFiles $Manifest
    if ($null -eq $entries) { return }

    foreach ($property in @($entries.PSObject.Properties)) {
        $relative = $property.Name
        if (-not (Test-SafeRelativePath $relative)) { continue }

        $sourceFile = Join-Path $Source ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (Test-Path -LiteralPath $sourceFile) { continue }

        $destinationFile = Join-Path $Destination ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $destinationFile)) { continue }
        Assert-SafePathChain $destinationFile
        if (-not (Test-RelativePathHasNoLinks $Destination $relative)) { continue }
        if ((Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash -eq [string]$property.Value) {
            Assert-SafePathChain $destinationFile
            Remove-Item -LiteralPath $destinationFile -Force
        }
    }
}

function Remove-ObsoleteManagedSkillDirectories(
    [string]$Source,
    [string]$Destination,
    $Manifest
) {
    if ($null -eq $Manifest -or ([int]($Manifest.schema_version) -ne 2 -and [int]($Manifest.schema_version) -ne 3)) { return }

    $directories = @($Manifest.skill.directories | Sort-Object { $_.Length } -Descending)
    foreach ($relative in $directories) {
        if (-not (Test-SafeRelativePath $relative)) { continue }

        $sourceDirectory = Join-Path $Source ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (Test-Path -LiteralPath $sourceDirectory) { continue }

        $destinationDirectory = Join-Path $Destination ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $destinationDirectory)) { continue }
        Assert-SafePathChain $destinationDirectory
        if (-not (Test-RelativePathHasNoLinks $Destination $relative)) { continue }
        if ($null -eq (Get-ChildItem -LiteralPath $destinationDirectory -Force | Select-Object -First 1)) {
            Assert-SafePathChain $destinationDirectory
            Remove-Item -LiteralPath $destinationDirectory -Force
        }
    }
}

function Skip-JsoncTrivia(
    [string]$Text,
    [int]$Index,
    [int]$EndIndex
) {
    while ($Index -lt $EndIndex) {
        if ([char]::IsWhiteSpace($Text[$Index])) {
            $Index++
            continue
        }

        $next = if ($Index + 1 -lt $EndIndex) { $Text[$Index + 1] } else { [char]0 }
        if ($Text[$Index] -eq '/' -and $next -eq '/') {
            $Index += 2
            while ($Index -lt $EndIndex -and $Text[$Index] -ne "`n" -and $Text[$Index] -ne "`r") { $Index++ }
            continue
        }

        if ($Text[$Index] -eq '/' -and $next -eq '*') {
            $Index += 2
            while ($Index + 1 -lt $EndIndex -and -not ($Text[$Index] -eq '*' -and $Text[$Index + 1] -eq '/')) {
                $Index++
            }
            if ($Index + 1 -ge $EndIndex) {
                throw "Comentário de bloco não terminado na configuração do OpenCode."
            }
            $Index += 2
            continue
        }

        break
    }

    return $Index
}

function Read-JsoncStringEnd(
    [string]$Text,
    [int]$StartIndex,
    [int]$EndIndex
) {
    if ($Text[$StartIndex] -ne '"') {
        throw "Era esperada uma string JSON."
    }

    for ($i = $StartIndex + 1; $i -lt $EndIndex; $i++) {
        if ($Text[$i] -eq '\') {
            $i++
            continue
        }
        if ($Text[$i] -eq '"') {
            return $i
        }
    }

    throw "String JSON não terminada na configuração do OpenCode."
}

function ConvertFrom-JsonStringLiteral([string]$Literal) {
    try {
        return (ConvertFrom-Json -InputObject ('{"value":' + $Literal + '}')).value
    } catch {
        throw "Nome de propriedade JSON inválido na configuração do OpenCode."
    }
}

function Find-MatchingJsoncDelimiter(
    [string]$Text,
    [int]$OpenIndex,
    [char]$OpenDelimiter,
    [char]$CloseDelimiter
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
            if ($ch -eq "`n" -or $ch -eq "`r") { $lineComment = $false }
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

        if ($ch -eq $OpenDelimiter) {
            $depth++
            continue
        }

        if ($ch -eq $CloseDelimiter) {
            $depth--
            if ($depth -eq 0) {
                return $i
            }
        }
    }

    return -1
}

function Find-MatchingJsoncBrace(
    [string]$Text,
    [int]$OpenIndex
) {
    return Find-MatchingJsoncDelimiter $Text $OpenIndex '{' '}'
}

function Get-JsoncValueEnd(
    [string]$Text,
    [int]$ValueStart,
    [int]$ObjectCloseIndex
) {
    $first = $Text[$ValueStart]
    if ($first -eq '"') {
        return Read-JsoncStringEnd $Text $ValueStart $ObjectCloseIndex
    }
    if ($first -eq '{') {
        $end = Find-MatchingJsoncDelimiter $Text $ValueStart '{' '}'
        if ($end -lt 0) { throw "Objeto JSON não terminado na configuração do OpenCode." }
        return $end
    }
    if ($first -eq '[') {
        $end = Find-MatchingJsoncDelimiter $Text $ValueStart '[' ']'
        if ($end -lt 0) { throw "Array JSON não terminado na configuração do OpenCode." }
        return $end
    }

    for ($i = $ValueStart; $i -lt $ObjectCloseIndex; $i++) {
        $next = if ($i + 1 -lt $ObjectCloseIndex) { $Text[$i + 1] } else { [char]0 }
        if ([char]::IsWhiteSpace($Text[$i]) -or $Text[$i] -eq ',' -or ($Text[$i] -eq '/' -and ($next -eq '/' -or $next -eq '*'))) {
            if ($i -eq $ValueStart) { throw "Era esperado um valor JSON na configuração do OpenCode." }
            return $i - 1
        }
    }

    if ($ObjectCloseIndex -eq $ValueStart) { throw "Era esperado um valor JSON na configuração do OpenCode." }
    return $ObjectCloseIndex - 1
}

function Get-JsoncObjectProperties(
    [string]$Text,
    [int]$OpenIndex,
    [int]$CloseIndex
) {
    $properties = @()
    $index = Skip-JsoncTrivia $Text ($OpenIndex + 1) $CloseIndex

    while ($index -lt $CloseIndex) {
        if ($Text[$index] -eq ',') {
            $index = Skip-JsoncTrivia $Text ($index + 1) $CloseIndex
            continue
        }
        if ($Text[$index] -ne '"') {
            throw "Era esperado um nome de propriedade JSON na configuração do OpenCode."
        }

        $nameStart = $index
        $nameEnd = Read-JsoncStringEnd $Text $nameStart $CloseIndex
        $name = ConvertFrom-JsonStringLiteral $Text.Substring($nameStart, $nameEnd - $nameStart + 1)
        $index = Skip-JsoncTrivia $Text ($nameEnd + 1) $CloseIndex
        if ($index -ge $CloseIndex -or $Text[$index] -ne ':') {
            throw "Era esperado ':' após a propriedade JSON '$name'."
        }

        $valueStart = Skip-JsoncTrivia $Text ($index + 1) $CloseIndex
        $valueEnd = Get-JsoncValueEnd $Text $valueStart $CloseIndex
        $properties += [PSCustomObject]@{
            Name = $name
            NameStart = $nameStart
            NameEnd = $nameEnd
            ValueStart = $valueStart
            ValueEnd = $valueEnd
        }

        $index = Skip-JsoncTrivia $Text ($valueEnd + 1) $CloseIndex
        if ($index -lt $CloseIndex -and $Text[$index] -eq ',') {
            $index = Skip-JsoncTrivia $Text ($index + 1) $CloseIndex
            continue
        }
        if ($index -ne $CloseIndex) {
            throw "Era esperado ',' ou '}' após a propriedade JSON '$name'."
        }
    }

    return $properties
}

function Get-JsoncRootObject(
    [string]$Text
) {
    $root = Skip-JsoncTrivia $Text 0 $Text.Length
    if ($root -ge $Text.Length -or $Text[$root] -ne '{') {
        throw "A configuração não contém um objeto JSON raiz."
    }
    $close = Find-MatchingJsoncBrace $Text $root
    if ($close -lt 0) {
        throw "Não foi possível encontrar a chave de fechamento do objeto JSON raiz."
    }
    # Validação adicional: garantir que não há conteúdo não comentado após o objeto raiz
    $after = Skip-JsoncTrivia $Text ($close + 1) $Text.Length
    if ($after -lt $Text.Length) {
        throw "Conteúdo JSONC inválido após o objeto raiz."
    }
    return [PSCustomObject]@{ Open = $root; Close = $close }
}

function Set-JsoncObjectScalar(
    [string]$Text,
    [int]$OpenIndex,
    [int]$CloseIndex,
    [string]$Name,
    [string]$JsonLiteral,
    [string]$Indent
) {
    $properties = Get-JsoncObjectProperties $Text $OpenIndex $CloseIndex
    $existing = $null
    foreach ($property in $properties) {
        if ($property.Name -eq $Name) { $existing = $property }
    }

    if ($null -ne $existing) {
        return $Text.Remove($existing.ValueStart, $existing.ValueEnd - $existing.ValueStart + 1).Insert($existing.ValueStart, $JsonLiteral)
    }

    $newline = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $tailStart = $CloseIndex
    while ($tailStart -gt $OpenIndex + 1 -and [char]::IsWhiteSpace($Text[$tailStart - 1])) {
        $tailStart--
    }

    if ($properties.Count -eq 0) {
        return $Text.Insert($CloseIndex, "$newline$Indent`"$Name`": $JsonLiteral$newline")
    }

    $last = $properties[$properties.Count - 1]
    $next = Skip-JsoncTrivia $Text ($last.ValueEnd + 1) $CloseIndex
    if ($next -ge $CloseIndex -or $Text[$next] -ne ',') {
        $Text = $Text.Insert($last.ValueEnd + 1, ',')
        $CloseIndex++
        $tailStart++
    }

    return $Text.Insert($tailStart, "$newline$Indent`"$Name`": $JsonLiteral")
}

function Set-TopLevelJsoncScalar(
    [string]$Text,
    [string]$Name,
    [string]$JsonLiteral
) {
    $root = Get-JsoncRootObject $Text
    return Set-JsoncObjectScalar $Text $root.Open $root.Close $Name $JsonLiteral "  "
}

function Remove-JsoncObjectProperty(
    [string]$Text,
    [int]$OpenIndex,
    [int]$CloseIndex,
    [string]$Name
) {
    $properties = @(Get-JsoncObjectProperties $Text $OpenIndex $CloseIndex)
    $targetIndex = -1
    for ($i = 0; $i -lt $properties.Count; $i++) {
        if ($properties[$i].Name -eq $Name) { $targetIndex = $i; break }
    }
    if ($targetIndex -lt 0) { return $Text }
    $target = $properties[$targetIndex]
    $start = [int]$target.NameStart
    $end = [int]$target.ValueEnd
    if ($targetIndex -lt $properties.Count - 1) {
        $next = $properties[$targetIndex + 1]
        $end = [int]$next.NameStart - 1
    } elseif ($targetIndex -gt 0) {
        $prev = $properties[$targetIndex - 1]
        $start = [int]$prev.ValueEnd + 1
    }
    return $Text.Remove($start, $end - $start + 1)
}

function Remove-LegacyExperimentalSubagentDepth([string]$Text) {
    $root = Get-JsoncRootObject $Text
    $properties = @(Get-JsoncObjectProperties $Text $root.Open $root.Close)
    $experimental = $null
    foreach ($property in $properties) { if ($property.Name -eq "experimental") { $experimental = $property } }
    if ($null -eq $experimental -or $Text[$experimental.ValueStart] -ne '{') { return $Text }

    $close = Find-MatchingJsoncBrace $Text $experimental.ValueStart
    if ($close -lt 0) { return $Text }

    # Remove only the legacy nested key first.
    $updated = Remove-JsoncObjectProperty $Text $experimental.ValueStart $close "subagent_depth"

    # Re-parse after mutation. If experimental became empty (comments/trivia only),
    # remove the whole top-level object. OpenCode V2 rejects an empty experimental object.
    $root2 = Get-JsoncRootObject $updated
    $properties2 = @(Get-JsoncObjectProperties $updated $root2.Open $root2.Close)
    $experimental2 = $null
    foreach ($property in $properties2) { if ($property.Name -eq "experimental") { $experimental2 = $property } }
    if ($null -eq $experimental2 -or $updated[$experimental2.ValueStart] -ne '{') { return $updated }

    $close2 = Find-MatchingJsoncBrace $updated $experimental2.ValueStart
    if ($close2 -lt 0) { return $updated }
    $experimentalProperties = @(Get-JsoncObjectProperties $updated $experimental2.ValueStart $close2)
    if ($experimentalProperties.Count -eq 0) {
        return Remove-JsoncObjectProperty $updated $root2.Open $root2.Close "experimental"
    }

    return $updated
}

function Set-V2SubagentDepth(
    [string]$Text,
    [int]$Depth
) {
    return Set-TopLevelJsoncScalar $Text "subagent_depth" "$Depth"
}

function Get-OpenCodeCli {
    foreach ($name in @("opencode2", "opencode")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) { return $command }
    }
    return $null
}

function Invoke-OpenCodeDebugConfig(
    $Cli,
    [string]$ConfigDir
) {
    $previousConfigDir = $env:OPENCODE_CONFIG_DIR
    try {
        $env:OPENCODE_CONFIG_DIR = $ConfigDir
        $output = & $Cli.Source debug config 2>&1
        $exitCode = $LASTEXITCODE
        return [PSCustomObject]@{
            ExitCode = $exitCode
            Output = @($output)
        }
    } catch {
        return [PSCustomObject]@{
            ExitCode = 1
            Output = @($_.Exception.Message)
        }
    } finally {
        $env:OPENCODE_CONFIG_DIR = $previousConfigDir
    }
}

function Test-ConfigCandidateWithOpenCode(
    $Cli,
    [string]$ConfigFileName,
    [string]$Candidate
) {
    if ($null -eq $Cli) { return $null }

    $staging = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-config-preflight-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
        $stagedConfig = Join-Path $staging $ConfigFileName
        Write-Utf8File $stagedConfig $Candidate
        return Invoke-OpenCodeDebugConfig $Cli $staging
    } finally {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Restore-ConfigAfterValidationFailure(
    [string]$ConfigPath,
    [bool]$OriginalExists,
    [string]$OriginalContent
) {
    if ($OriginalExists) {
        Write-Utf8File $ConfigPath $OriginalContent
    } elseif (Test-Path -LiteralPath $ConfigPath) {
        Remove-Item -LiteralPath $ConfigPath -Force
    }
}

function Get-ManagedAmbientCandidate([string]$Existing, [string]$Block) {
    $begin = "<!-- AI-DRIVEN-ENGINEERING:BEGIN v4 -->"
    $end = "<!-- AI-DRIVEN-ENGINEERING:END v4 -->"
    $start = $Existing.IndexOf($begin, [StringComparison]::Ordinal)
    if ($start -ge 0) {
        $finish = $Existing.IndexOf($end, $start, [StringComparison]::Ordinal)
        if ($finish -lt 0) { throw "AGENTS.md contém marcador inicial da v4 sem marcador final." }
        $finish += $end.Length
        return $Existing.Remove($start, $finish - $start).Insert($start, $Block.Trim())
    }
    if ([string]::IsNullOrWhiteSpace($Existing)) { return $Block.Trim() + [Environment]::NewLine }
    $prefix = $Existing.TrimEnd()
    return $prefix + [Environment]::NewLine + [Environment]::NewLine + $Block.Trim() + [Environment]::NewLine
}

$PackageVersion = "4.1.1"
Write-Host "Instalando AI-Driven Engineering v$PackageVersion em: $Target"

$AgentSource = Join-Path $PackageRoot "agents"
$AgentTarget = Join-Path $Target "agents"
$SkillSource = Join-Path (Join-Path $PackageRoot "skills") "ai-driven-engineering"
$SkillsTarget = Join-Path $Target "skills"
$SkillTarget = Join-Path $SkillsTarget "ai-driven-engineering"
$RuntimeSource = Join-Path $PackageRoot "runtime"
$RuntimeBaseTarget = Join-Path $Target "ai-driven-engineering"
$RuntimeTarget = Join-Path $RuntimeBaseTarget "runtime"
$AmbientSource = Join-Path $PackageRoot "AGENTS.managed.md"
$AmbientPath = Join-Path $Target "AGENTS.md"
$ManifestPath = Join-Path $Target "ai-driven-engineering-install.json"

Assert-SafePathChain $Target
Assert-SafePathChain $SkillsTarget
Assert-SafePathChain $AgentTarget
Assert-SafePathChain $SkillTarget
Assert-SafePathChain $RuntimeBaseTarget
Assert-SafePathChain $RuntimeTarget
Assert-SafePathChain $AmbientPath
Assert-SafePathChain $BackupBase
Assert-SafePathChain $BackupRoot
Assert-SafePathChain $ManifestPath

$ConfigPathSelected = $null
$ConfigOriginalContent = $null
$ConfigOriginalExists = $false
$ConfigCandidate = $null
$ConfigNeedsUpdate = $false
$ConfigBackupPath = $null
$OpenCodeCli = if ($SkipRuntimeCheck) { $null } else { Get-OpenCodeCli }

if (-not $NoConfigPatch) {
    $jsonc = Join-Path $Target "opencode.jsonc"
    $json  = Join-Path $Target "opencode.json"
    if (Test-Path -LiteralPath $jsonc) {
        $ConfigPathSelected = $jsonc
        Assert-SafePathChain $ConfigPathSelected
        if (Test-ItemIsLink (Get-Item -LiteralPath $ConfigPathSelected -Force)) {
            throw "A configuração do OpenCode é um link simbólico ou junction; a instalação foi interrompida por segurança."
        }
        $ConfigOriginalContent = Read-Utf8File $ConfigPathSelected
        $ConfigOriginalExists = $true
    } elseif (Test-Path -LiteralPath $json) {
        $ConfigPathSelected = $json
        Assert-SafePathChain $ConfigPathSelected
        if (Test-ItemIsLink (Get-Item -LiteralPath $ConfigPathSelected -Force)) {
            throw "A configuração do OpenCode é um link simbólico ou junction; a instalação foi interrompida por segurança."
        }
        $ConfigOriginalContent = Read-Utf8File $ConfigPathSelected
        $ConfigOriginalExists = $true
    } else {
        $ConfigPathSelected = $jsonc
        $parentForConfig = Split-Path -Parent $ConfigPathSelected
        if (-not [string]::IsNullOrWhiteSpace($parentForConfig)) { Assert-SafePathChain $parentForConfig }
        $ConfigOriginalContent = $null
        $ConfigOriginalExists = $false
    }
    $initialText = if ($ConfigOriginalExists) { $ConfigOriginalContent } else { "{`r`n}" }
    $candidate = $initialText
    $candidate = Remove-LegacyExperimentalSubagentDepth $candidate
    $candidate = Set-V2SubagentDepth $candidate 2
    if (-not $NoDefaultAgent) {
        $candidate = Set-TopLevelJsoncScalar $candidate "default_agent" '"orchestrator"'
    }
    $ConfigCandidate = $candidate
    if ($ConfigOriginalExists) {
        $ConfigNeedsUpdate = -not $candidate.Equals($ConfigOriginalContent, [StringComparison]::Ordinal)
    } else {
        $ConfigNeedsUpdate = $true
    }

    # Runtime schema gate before mutating the installation. This catches V2-invalid
    # migrations such as a legacy experimental object becoming empty.
    if (-not $SkipRuntimeCheck -and $null -ne $OpenCodeCli) {
        $configName = Split-Path -Leaf $ConfigPathSelected
        $preflight = Test-ConfigCandidateWithOpenCode $OpenCodeCli $configName $ConfigCandidate
        if ($null -eq $preflight -or $preflight.ExitCode -ne 0) {
            $details = if ($null -ne $preflight) { ($preflight.Output -join [Environment]::NewLine) } else { "sem saída" }
            throw "OpenCode rejeitou a configuração candidata antes da instalação.`n$details"
        }
        Write-Host "OpenCode config preflight: OK ($($OpenCodeCli.Name))"
    } elseif (-not $SkipRuntimeCheck -and $null -eq $OpenCodeCli) {
        Write-Host "WARN: OpenCode CLI (opencode2/opencode) não encontrado no PATH; o gate runtime será adiado."
    }
}

$AmbientOriginalExists = $false
$AmbientOriginalContent = ""
$AmbientCandidate = $null
$AmbientNeedsUpdate = $false
$AmbientBackupPath = $null
if (-not $NoAmbientInstructions) {
    if (-not (Test-Path -LiteralPath $AmbientSource)) { throw "Bloco AGENTS.managed.md ausente no pacote." }
    if (Test-Path -LiteralPath $AmbientPath) {
        if (Test-ItemIsLink (Get-Item -LiteralPath $AmbientPath -Force)) { throw "AGENTS.md é link simbólico ou junction." }
        $AmbientOriginalExists = $true
        $AmbientOriginalContent = Read-Utf8File $AmbientPath
    }
    $block = Read-Utf8File $AmbientSource
    $AmbientCandidate = Get-ManagedAmbientCandidate $AmbientOriginalContent $block
    $AmbientNeedsUpdate = -not $AmbientCandidate.Equals($AmbientOriginalContent, [StringComparison]::Ordinal)
}

$PreviousManifest = Read-InstallManifest $ManifestPath
New-SafeDirectory $AgentTarget
if (-not (Test-DirectoryTreeHasNoLinks $AgentTarget)) {
    throw "A pasta de agents contém link simbólico ou junction; a instalação foi interrompida por segurança."
}
Remove-ObsoleteManagedAgents $AgentSource $AgentTarget $PreviousManifest -Force:$Force
foreach ($sourceAgent in @(Get-ChildItem $AgentSource -Recurse -File -Force -Filter "*.md")) {
    $relative = Get-RelativeFilePath $AgentSource $sourceAgent.FullName
    $destinationAgent = Join-Path $AgentTarget ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    $destParent = Split-Path -Parent $destinationAgent
    Assert-SafePathChain $destParent
    New-SafeDirectory $destParent
    Assert-SafePathChain $destinationAgent
    if ((Test-Path -LiteralPath $destinationAgent)) {
        if (Test-ItemIsLink (Get-Item -LiteralPath $destinationAgent -Force)) { throw "Destino é reparse point: $destinationAgent" }
        if (Test-FileContentMatch $sourceAgent.FullName $destinationAgent) { continue }
        $backup = Backup-File $destinationAgent
        if ($backup) { Write-Host "Backup do agent existente: $backup" }
    }
    Copy-Item -LiteralPath $sourceAgent.FullName -Destination $destinationAgent -Force
    if (-not (Test-FileContentMatch $sourceAgent.FullName $destinationAgent)) { throw "Falha ao verificar cópia do agent: $destinationAgent" }
}

Assert-SafePathChain $SkillTarget
if ((Test-Path -LiteralPath $SkillTarget) -and -not (Test-DirectoryTreeHasNoLinks $SkillTarget)) {
    throw "A pasta da skill contém link simbólico ou junction; a instalação foi interrompida por segurança."
}
if ((Test-Path -LiteralPath $SkillTarget) -and -not $Force) {
    Remove-ObsoleteManagedSkillFiles $SkillSource $SkillTarget $PreviousManifest
    Remove-ObsoleteManagedSkillDirectories $SkillSource $SkillTarget $PreviousManifest
}
if ((Test-Path -LiteralPath $SkillTarget)) {
    Assert-SafePathChain $SkillTarget
    if (-not (Test-DirectoryContentMatch $SkillSource $SkillTarget)) {
        $backup = Backup-Directory $SkillTarget
        if ($backup) { Write-Host "Backup da skill existente: $backup" }
    }
}
if ((Test-Path -LiteralPath $SkillTarget) -and $Force) {
    Assert-SafePathChain $SkillTarget
    if (-not (Test-DirectoryTreeHasNoLinks $SkillTarget)) {
        throw "A pasta da skill contém link simbólico ou junction; a instalação foi interrompida por segurança."
    }
    Remove-Item -LiteralPath $SkillTarget -Recurse -Force
}
New-SafeDirectory $SkillTarget
foreach ($sourceItem in @(Get-ChildItem -LiteralPath $SkillSource -Force)) {
    $dest = Join-Path $SkillTarget $sourceItem.Name
    if (Test-Path -LiteralPath $dest) { Assert-SafePathChain $dest }
    Copy-Item -LiteralPath $sourceItem.FullName -Destination $SkillTarget -Recurse -Force
}
if (-not (Test-DirectoryContentMatch $SkillSource $SkillTarget)) { throw "Falha ao verificar skill instalada" }

# Runtime determinístico (bootstrap, state machine, smoke e eval harness)
if ((Test-Path -LiteralPath $RuntimeTarget) -and -not (Test-DirectoryTreeHasNoLinks $RuntimeTarget)) {
    throw "A pasta runtime contém link simbólico ou junction."
}
if (Test-Path -LiteralPath $RuntimeTarget) {
    if (-not (Test-DirectoryContentMatch $RuntimeSource $RuntimeTarget)) {
        $backup = Backup-Directory $RuntimeTarget
        if ($backup) { Write-Host "Backup do runtime existente: $backup" }
        Remove-Item -LiteralPath $RuntimeTarget -Recurse -Force
    }
}
New-SafeDirectory $RuntimeTarget
foreach ($sourceItem in @(Get-ChildItem -LiteralPath $RuntimeSource -Force)) {
    Copy-Item -LiteralPath $sourceItem.FullName -Destination $RuntimeTarget -Recurse -Force
}
if (-not (Test-DirectoryContentMatch $RuntimeSource $RuntimeTarget)) { throw "Falha ao verificar runtime instalado" }

if (-not $NoConfigPatch -and $ConfigNeedsUpdate) {
    Assert-SafePathChain $ConfigPathSelected
    if ($ConfigOriginalExists) {
        Assert-SafePathChain $ConfigPathSelected
        if (Test-ItemIsLink (Get-Item -LiteralPath $ConfigPathSelected -Force)) {
            throw "A configuração do OpenCode é um link simbólico ou junction; a instalação foi interrompida por segurança."
        }
        $backup = Backup-File $ConfigPathSelected
        $ConfigBackupPath = $backup
        if ($backup) {
            Write-Host "Backup da configuração: $backup"
        }
    } else {
        $parentForConfig = Split-Path -Parent $ConfigPathSelected
        if (-not [string]::IsNullOrWhiteSpace($parentForConfig)) { Assert-SafePathChain $parentForConfig }
    }
    $configDir = Split-Path -Parent $ConfigPathSelected
    if ([string]::IsNullOrWhiteSpace($configDir)) { $configDir = $Target }
    New-SafeDirectory $configDir
    $tempFile = Join-Path $configDir (".tmp-opencode-" + [Guid]::NewGuid().ToString("N"))
    Write-Utf8File $tempFile $ConfigCandidate
    if ($ConfigOriginalExists) {
        try {
            [System.IO.File]::Replace($tempFile, $ConfigPathSelected, $null) | Out-Null
        } catch {
            Move-Item -LiteralPath $tempFile -Destination $ConfigPathSelected -Force
        }
        if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue }
    } else {
        Move-Item -LiteralPath $tempFile -Destination $ConfigPathSelected -Force
    }
    $written = Read-Utf8File $ConfigPathSelected
    if (-not $written.Equals($ConfigCandidate, [StringComparison]::Ordinal)) { throw "Falha ao verificar escrita da configuração" }
    Write-Host "Configuração atualizada sem alterar providers/MCPs existentes: $ConfigPathSelected"
} elseif (-not $NoConfigPatch -and -not $ConfigNeedsUpdate) {
    Write-Host "Configuração já está atualizada: $ConfigPathSelected"
}

# Mandatory runtime gate when an OpenCode CLI is available. Never leave a config
# produced by this installer in an invalid state.
if (-not $NoConfigPatch -and -not $SkipRuntimeCheck -and $null -ne $OpenCodeCli) {
    $postValidation = Invoke-OpenCodeDebugConfig $OpenCodeCli $Target
    if ($postValidation.ExitCode -ne 0) {
        Restore-ConfigAfterValidationFailure $ConfigPathSelected $ConfigOriginalExists $ConfigOriginalContent
        $details = $postValidation.Output -join [Environment]::NewLine
        throw "INSTALLATION_FAILED: OpenCode debug config rejeitou a configuração instalada. A configuração anterior foi restaurada.`n$details"
    }
    Write-Host "OpenCode debug config: OK ($($OpenCodeCli.Name))"
}

if (-not $NoAmbientInstructions -and $AmbientNeedsUpdate) {
    if ($AmbientOriginalExists) {
        $AmbientBackupPath = Backup-File $AmbientPath
        if ($AmbientBackupPath) { Write-Host "Backup do AGENTS.md: $AmbientBackupPath" }
    }
    $ambientDir = Split-Path -Parent $AmbientPath
    New-SafeDirectory $ambientDir
    $tmpAmbient = Join-Path $ambientDir (".tmp-agents-" + [Guid]::NewGuid().ToString("N"))
    Write-Utf8File $tmpAmbient $AmbientCandidate
    Move-Item -LiteralPath $tmpAmbient -Destination $AmbientPath -Force
    if (-not (Read-Utf8File $AmbientPath).Equals($AmbientCandidate, [StringComparison]::Ordinal)) { throw "Falha ao verificar AGENTS.md" }
    Write-Host "Invariantes persistentes instaladas em: $AmbientPath"
}

$configInfo = $null
if (-not $NoConfigPatch) {
    $currentConfigHash = if (Test-Path -LiteralPath $ConfigPathSelected) { (Get-FileHash -LiteralPath $ConfigPathSelected -Algorithm SHA256).Hash } else { $null }
    if (-not $ConfigNeedsUpdate -and $PreviousManifest -and [int]($PreviousManifest.schema_version) -ge 4 -and $null -ne $PreviousManifest.config -and $PreviousManifest.config.changed_by_installer -and [string]$PreviousManifest.config.path -eq $ConfigPathSelected -and [string]$PreviousManifest.config.installed_hash -eq $currentConfigHash) {
        $configInfo = $PreviousManifest.config
    } else {
        $configInfo = [ordered]@{
            path = $ConfigPathSelected
            existed_before = $ConfigOriginalExists
            changed_by_installer = $ConfigNeedsUpdate
            backup_path = $ConfigBackupPath
            installed_hash = $currentConfigHash
        }
    }
}
$ambientInfo = $null
if (-not $NoAmbientInstructions) {
    $currentAmbientHash = if (Test-Path -LiteralPath $AmbientPath) { (Get-FileHash -LiteralPath $AmbientPath -Algorithm SHA256).Hash } else { $null }
    if (-not $AmbientNeedsUpdate -and $PreviousManifest -and [int]($PreviousManifest.schema_version) -ge 4 -and $null -ne $PreviousManifest.ambient -and $PreviousManifest.ambient.changed_by_installer -and [string]$PreviousManifest.ambient.path -eq $AmbientPath -and [string]$PreviousManifest.ambient.installed_hash -eq $currentAmbientHash) {
        $ambientInfo = $PreviousManifest.ambient
    } else {
        $ambientInfo = [ordered]@{
            path = $AmbientPath
            existed_before = $AmbientOriginalExists
            changed_by_installer = $AmbientNeedsUpdate
            backup_path = $AmbientBackupPath
            installed_hash = $currentAmbientHash
        }
    }
}

Write-InstallManifest $ManifestPath $AgentSource $AgentTarget $SkillSource $SkillTarget $RuntimeSource $RuntimeTarget $configInfo $ambientInfo | Out-Null

Write-Host ""
Write-Host "Agents de controle instalados:"
foreach ($name in @("orchestrator","product-owner","project-manager","engineer")) {
    Write-Host "  - $name"
}

Write-Host ""
Write-Host "Especialistas de engenharia instalados:"
foreach ($name in @(
    "explorer","researcher","modeler","engineering-planner",
    "tester","implementer","verifier","debugger","reviewer",
    "security-reviewer","integrator","documenter"
)) {
    Write-Host "  - $name"
}

Write-Host ""
Write-Host "Skill instalada: ai-driven-engineering"
Write-Host "subagent_depth: 2 (raiz da configuração V2)"
if (-not $NoDefaultAgent) {
    Write-Host "default_agent: orchestrator"
}

Write-Host ""
Write-Host "Bootstrap opcional do projeto:"
$PowerShellExecutable = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { "powershell" } else { "pwsh" }
$BootstrapScript = Join-Path $RuntimeTarget "bootstrap-project.ps1"
Write-Host "  $PowerShellExecutable -ExecutionPolicy Bypass -File `"$BootstrapScript`""
if ($SkipRuntimeCheck) {
    Write-Host "Validação runtime ignorada por -SkipRuntimeCheck."
} elseif ($null -eq $OpenCodeCli) {
    Write-Host "OpenCode CLI não encontrado; execute depois: opencode2 debug config (ou opencode debug config)."
} else {
    Write-Host "Gate de configuração concluído com sucesso usando $($OpenCodeCli.Name)."
}

Write-Host ""
Write-Host "Reinicie o OpenCode / OpenCode V2 ou inicie uma nova sessão para recarregar os arquivos instalados."
