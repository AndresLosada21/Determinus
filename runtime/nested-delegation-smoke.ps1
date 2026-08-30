param(
    [string]$Target = (Join-Path $HOME ".config/opencode"),
    [string]$Model
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

function Get-ObjectPropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Get-StructuredValue {
    param(
        [object]$Object,
        [string[]]$Path
    )

    $current = $Object
    foreach ($segment in $Path) {
        $current = Get-ObjectPropertyValue $current $segment
        if ($null -eq $current) { return $null }
    }
    return $current
}

function ConvertFrom-StrictJsonLines {
    param(
        [object[]]$Output,
        [string]$Label
    )

    $items = @()
    $lineNumber = 0
    foreach ($outputItem in @($Output)) {
        foreach ($line in ([string]$outputItem -split "`r?`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $lineNumber++
            try {
                $items += ($line | ConvertFrom-Json -ErrorAction Stop)
            } catch {
                throw "NESTED_DELEGATION_FAILED: $Label JSONL inválido na linha $lineNumber; --format json deve emitir um objeto JSON por linha."
            }
        }
    }
    if ($items.Count -eq 0) {
        throw "NESTED_DELEGATION_FAILED: $Label não emitiu eventos JSON."
    }
    return @($items)
}

function ConvertFrom-StrictExportJson {
    param(
        [object[]]$Output,
        [string]$Label
    )

    $raw = (@($Output) | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label está vazio."
    }
    try {
        return ($raw | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label não possui o JSON estrutural esperado."
    }
}

function Assert-ExportInfo {
    param(
        [object]$Export,
        [string]$Label,
        [string]$ExpectedSessionId,
        [string]$ExpectedParentId,
        [string]$ExpectedAgent
    )

    $info = Get-ObjectPropertyValue $Export "info"
    if ($null -eq $info) {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label não contém info."
    }
    if ([string](Get-ObjectPropertyValue $info "id") -cne $ExpectedSessionId) {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label possui info.id divergente."
    }
    if ([string](Get-ObjectPropertyValue $info "parentID") -cne $ExpectedParentId) {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label possui parentID divergente."
    }
    if ([string](Get-ObjectPropertyValue $info "agent") -cne $ExpectedAgent) {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label possui info.agent divergente."
    }
    if ([string](Get-ObjectPropertyValue $info "outcome") -cne "succeeded") {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label não possui outcome=succeeded."
    }
}

function Test-AssistantTextMarker {
    param(
        [object]$Export,
        [string]$ExpectedAgent,
        [string]$Marker
    )

    $messages = Get-ObjectPropertyValue $Export "messages"
    if ($null -eq $messages) { return $false }
    foreach ($message in @($messages)) {
        if ([string](Get-ObjectPropertyValue $message "type") -cne "assistant") { continue }
        if ([string](Get-ObjectPropertyValue $message "agent") -cne $ExpectedAgent) { continue }
        $content = Get-ObjectPropertyValue $message "content"
        if ($null -eq $content) { continue }
        foreach ($entry in @($content)) {
            if ([string](Get-ObjectPropertyValue $entry "type") -cne "text") { continue }
            $text = Get-ObjectPropertyValue $entry "text"
            if ($text -is [string] -and $text.Trim() -ceq $Marker) { return $true }
        }
    }
    return $false
}

function Get-RootToolEvents {
    param([object[]]$RootEvents)

    $events = @()
    foreach ($event in @($RootEvents)) {
        $eventType = [string](Get-ObjectPropertyValue $event "type")
        $partType = [string](Get-StructuredValue $event @("part", "type"))
        if ($eventType -ceq "tool_use" -or $partType -ceq "tool") {
            $events += $event
        }
    }
    return @($events)
}

function Get-ExportToolEntries {
    param(
        [object]$Export,
        [string]$Label
    )

    $messages = Get-ObjectPropertyValue $Export "messages"
    if ($null -eq $messages) {
        throw "NESTED_DELEGATION_FAILED: export da sessão $Label não contém messages."
    }

    $events = @()
    foreach ($message in @($messages)) {
        $content = Get-ObjectPropertyValue $message "content"
        if ($null -eq $content) { continue }
        foreach ($entry in @($content)) {
            if ([string](Get-ObjectPropertyValue $entry "type") -ceq "tool") {
                $events += [pscustomobject]@{
                    Message = $message
                    Entry = $entry
                }
            }
        }
    }
    return @($events)
}

function Get-RootToolName {
    param([object]$Event)
    return [string](Get-StructuredValue $Event @("part", "tool"))
}

function Get-RootToolInput {
    param([object]$Event, [string]$Name)
    return Get-StructuredValue $Event @("part", "state", "input", $Name)
}

function Get-ExportToolName {
    param([object]$ToolRecord)
    $entry = Get-ObjectPropertyValue $ToolRecord "Entry"
    return [string](Get-ObjectPropertyValue $entry "name")
}

function Get-ExportToolInput {
    param([object]$ToolRecord, [string]$Name)
    $entry = Get-ObjectPropertyValue $ToolRecord "Entry"
    return Get-StructuredValue $entry @("state", "input", $Name)
}

function Assert-AssistantToolRecord {
    param([object]$ToolRecord, [string]$ExpectedAgent, [string]$Label)
    $message = Get-ObjectPropertyValue $ToolRecord "Message"
    if ([string](Get-ObjectPropertyValue $message "type") -cne "assistant" -or
        [string](Get-ObjectPropertyValue $message "agent") -cne $ExpectedAgent) {
        throw "NESTED_DELEGATION_FAILED: tool $Label não pertence a uma mensagem assistant de $ExpectedAgent."
    }
}

$cli = Resolve-OpenCodeCli
if ($null -eq $cli) { throw "NESTED_DELEGATION_FAILED: OpenCode CLI não encontrado." }

$nonce = [Guid]::NewGuid().ToString("N")
$level1Marker = "NESTED_LEVEL1_$nonce"
$level2Marker = "NESTED_LEVEL2_$nonce"
$prompt = @"
OPERATIONAL NESTED DELEGATION SMOKE. Este é um sandbox temporário vazio, não trabalho de produto.

É proibido ler ou escrever arquivos, usar shell, web, rede, provider externo ou credenciais. Além da cadeia `subagent`, cada agent pode carregar no máximo uma vez a skill `ai-driven-engineering`, se o próprio system prompt exigir isso. Nenhuma outra tool é permitida.

Você está no orchestrator e DEVE executar exatamente a cadeia:
1. invoque project-manager como subagent;
2. no brief, instrua o project-manager a invocar tracker-operator como subagent;
3. tracker-operator deve responder exatamente $level2Marker;
4. project-manager deve retornar exatamente $level1Marker somente depois de receber $level2Marker;
5. você só pode finalizar com NESTED_DELEGATION_OK se as duas invocações realmente ocorrerem e retornarem com sucesso.

É proibido emular qualquer owner, responder pelo subagent ausente, pedir confirmação humana ou substituir a delegação por explicação. Se qualquer invocação falhar, finalize com `NESTED_DELEGATION_FAILED` e o erro observado, sem segredos.
"@

$sandbox = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-nested-delegation-" + [Guid]::NewGuid().ToString("N"))
$sandboxCreated = $false
$sandboxPushed = $false
$previousConfigDir = $env:OPENCODE_CONFIG_DIR
try {
    if (Test-Path -LiteralPath $sandbox) {
        throw "NESTED_DELEGATION_FAILED: caminho de sandbox temporário já existe."
    }
    New-Item -ItemType Directory -Path $sandbox -ErrorAction Stop | Out-Null
    $sandboxCreated = $true
    if (@(Get-ChildItem -LiteralPath $sandbox -Force).Count -ne 0) {
        throw "NESTED_DELEGATION_FAILED: sandbox temporário não está vazio."
    }

    Push-Location -LiteralPath $sandbox
    $sandboxPushed = $true
    $env:OPENCODE_CONFIG_DIR = $Target

    $runArgs = @('run','--agent','orchestrator','--format','json')
    if (-not [string]::IsNullOrWhiteSpace($Model)) { $runArgs += @('--model',$Model) }
    $runArgs += @($prompt)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $rootOutput = @(& $cli.Name @runArgs 2>&1)
        $rootExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($rootExit -ne 0) {
        throw "NESTED_DELEGATION_FAILED: fase OpenCode run falhou (exit=$rootExit)."
    }

    # --format json is JSONL. Parse every line. Skill loading is an allowed
    # prerequisite, but handoff proof comes only from completed subagent events.
    # Retries of the same handoff are tolerated; divergent tools/targets are not.
    $rootEvents = @(ConvertFrom-StrictJsonLines $rootOutput "root")
    $rootToolEvents = @(Get-RootToolEvents $rootEvents)
    $rootSkillEvents = @()
    $rootSubagentEvents = @()
    foreach ($event in $rootToolEvents) {
        $tool = Get-RootToolName $event
        $status = [string](Get-StructuredValue $event @("part", "state", "status"))
        if ($status -cne "completed") {
            throw "NESTED_DELEGATION_FAILED: tool $tool da root não está completed."
        }
        if ($tool -ceq "skill") {
            if ([string](Get-RootToolInput $event "id") -cne "ai-driven-engineering") {
                throw "NESTED_DELEGATION_FAILED: root carregou skill divergente de ai-driven-engineering."
            }
            $rootSkillEvents += $event
            continue
        }
        if ($tool -ceq "subagent") {
            if ([string](Get-RootToolInput $event "agent") -cne "project-manager") {
                throw "NESTED_DELEGATION_FAILED: root invocou subagent divergente de project-manager."
            }
            $rootSubagentEvents += $event
            continue
        }
        throw "NESTED_DELEGATION_FAILED: root usou tool não permitida no smoke: $tool."
    }
    if ($rootSkillEvents.Count -gt 1) {
        throw "NESTED_DELEGATION_FAILED: root carregou ai-driven-engineering mais de uma vez."
    }
    if ($rootSubagentEvents.Count -lt 1) {
        throw "NESTED_DELEGATION_FAILED: root não contém subagent completed para project-manager."
    }

    # A model may retry the same handoff. Use the last completed call as the
    # continuation session, while requiring every retry to target the same owner.
    $rootEvent = $rootSubagentEvents[$rootSubagentEvents.Count - 1]
    if ([string](Get-ObjectPropertyValue $rootEvent "type") -cne "tool_use" -or
        [string](Get-StructuredValue $rootEvent @("part", "type")) -cne "tool") {
        throw "NESTED_DELEGATION_FAILED: evento de handoff da root não possui tool_use/part.type=tool."
    }
    $rootSessionId = [string](Get-ObjectPropertyValue $rootEvent "sessionID")
    # Observed shapes: root JSONL nests metadata twice; some builds use one level.
    $pmSessionId = [string](Get-StructuredValue $rootEvent @("part", "state", "metadata", "metadata", "sessionID"))
    if ([string]::IsNullOrWhiteSpace($pmSessionId)) {
        $pmSessionId = [string](Get-StructuredValue $rootEvent @("part", "state", "metadata", "sessionID"))
    }
    if ([string]::IsNullOrWhiteSpace($rootSessionId)) {
        throw "NESTED_DELEGATION_FAILED: evento root de project-manager não contém sessionID da raiz."
    }
    if ([string]::IsNullOrWhiteSpace($pmSessionId)) {
        throw "NESTED_DELEGATION_FAILED: evento root de project-manager não contém sessionID filho no metadata do mesmo evento."
    }

    # `--sanitize` redige state.input e conteúdo text, que são precisamente os
    # campos estruturais verificados abaixo. Export cru é permitido somente neste
    # sandbox novo e vazio, cujo prompt proíbe arquivos, rede e providers.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $pmOutput = @(& $cli.Name export $pmSessionId 2>&1)
        $pmExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($pmExit -ne 0) {
        throw "NESTED_DELEGATION_FAILED: fase export da sessão project-manager falhou (exit=$pmExit)."
    }
    $pmExport = ConvertFrom-StrictExportJson $pmOutput "project-manager"
    Assert-ExportInfo $pmExport "project-manager" $pmSessionId $rootSessionId "project-manager"

    $pmToolRecords = @(Get-ExportToolEntries $pmExport "project-manager")
    $pmSkillRecords = @()
    $pmSubagentRecords = @()
    foreach ($record in $pmToolRecords) {
        Assert-AssistantToolRecord $record "project-manager" "da sessão project-manager"
        $entry = Get-ObjectPropertyValue $record "Entry"
        $tool = Get-ExportToolName $record
        $status = [string](Get-StructuredValue $entry @("state", "status"))
        if ($status -cne "completed") {
            throw "NESTED_DELEGATION_FAILED: tool $tool da sessão project-manager não está completed."
        }
        # `executed` is advisory in beta exports and may be false even when the
        # completed state + child session prove successful execution.
        if ($tool -ceq "skill") {
            if ([string](Get-ExportToolInput $record "id") -cne "ai-driven-engineering") {
                throw "NESTED_DELEGATION_FAILED: project-manager carregou skill divergente de ai-driven-engineering."
            }
            $pmSkillRecords += $record
            continue
        }
        if ($tool -ceq "subagent") {
            if ([string](Get-ExportToolInput $record "agent") -cne "tracker-operator") {
                throw "NESTED_DELEGATION_FAILED: project-manager invocou subagent divergente de tracker-operator."
            }
            $pmSubagentRecords += $record
            continue
        }
        throw "NESTED_DELEGATION_FAILED: project-manager usou tool não permitida no smoke: $tool."
    }
    if ($pmSkillRecords.Count -gt 1) {
        throw "NESTED_DELEGATION_FAILED: project-manager carregou ai-driven-engineering mais de uma vez."
    }
    if ($pmSubagentRecords.Count -lt 1) {
        throw "NESTED_DELEGATION_FAILED: project-manager não contém subagent completed para tracker-operator."
    }

    $trackerRecord = $pmSubagentRecords[$pmSubagentRecords.Count - 1]
    $trackerToolEvent = Get-ObjectPropertyValue $trackerRecord "Entry"
    # Export shape (observed): state.metadata.sessionID; some builds nest it
    # twice. Accept both without weakening the binding.
    $trackerSessionId = [string](Get-StructuredValue $trackerToolEvent @("state", "metadata", "sessionID"))
    if ([string]::IsNullOrWhiteSpace($trackerSessionId)) {
        $trackerSessionId = [string](Get-StructuredValue $trackerToolEvent @("state", "metadata", "metadata", "sessionID"))
    }
    if ([string]::IsNullOrWhiteSpace($trackerSessionId)) {
        throw "NESTED_DELEGATION_FAILED: tracker-operator não contém child sessionID no metadata do mesmo evento."
    }

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $trackerOutput = @(& $cli.Name export $trackerSessionId 2>&1)
        $trackerExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($trackerExit -ne 0) {
        throw "NESTED_DELEGATION_FAILED: fase export da sessão tracker-operator falhou (exit=$trackerExit)."
    }
    $trackerExport = ConvertFrom-StrictExportJson $trackerOutput "tracker-operator"
    Assert-ExportInfo $trackerExport "tracker-operator" $trackerSessionId $pmSessionId "tracker-operator"

    $trackerToolRecords = @(Get-ExportToolEntries $trackerExport "tracker-operator")
    $trackerSkillRecords = @()
    foreach ($record in $trackerToolRecords) {
        Assert-AssistantToolRecord $record "tracker-operator" "da sessão tracker-operator"
        $entry = Get-ObjectPropertyValue $record "Entry"
        $tool = Get-ExportToolName $record
        $status = [string](Get-StructuredValue $entry @("state", "status"))
        if ($tool -cne "skill" -or $status -cne "completed" -or [string](Get-ExportToolInput $record "id") -cne "ai-driven-engineering") {
            throw "NESTED_DELEGATION_FAILED: tracker-operator usou tool não permitida no smoke: $tool."
        }
        $trackerSkillRecords += $record
    }
    if ($trackerSkillRecords.Count -gt 1) {
        throw "NESTED_DELEGATION_FAILED: tracker-operator carregou ai-driven-engineering mais de uma vez."
    }

    if (-not (Test-AssistantTextMarker $pmExport "project-manager" $level1Marker)) {
        throw "NESTED_DELEGATION_FAILED: marcador $level1Marker ausente em conteúdo text de mensagem assistant do project-manager."
    }
    if (-not (Test-AssistantTextMarker $trackerExport "tracker-operator" $level2Marker)) {
        throw "NESTED_DELEGATION_FAILED: marcador $level2Marker ausente em conteúdo text de mensagem assistant do tracker-operator."
    }

    Write-Host "NESTED_DELEGATION_OK"
    Write-Host "SUBAGENT_DEPTH_VALIDATED: orchestrator -> project-manager -> tracker-operator"
} finally {
    try {
        if ($sandboxPushed) { Pop-Location }
    } finally {
        $env:OPENCODE_CONFIG_DIR = $previousConfigDir
        if ($sandboxCreated -and (Test-Path -LiteralPath $sandbox)) {
            Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
