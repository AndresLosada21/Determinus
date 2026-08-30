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

function Assert-RootSkillEvent {
    param([object]$Event)

    if ([string](Get-StructuredValue $Event @("part", "tool")) -cne "skill") {
        throw "NESTED_DELEGATION_FAILED: tool root esperado=skill ao validar prerequisite."
    }
    if ([string](Get-StructuredValue $Event @("part", "state", "status")) -cne "completed") {
        throw "NESTED_DELEGATION_FAILED: skill da root não está concluída."
    }
    # At most one benign skill load is tolerated as a non-mutant prerequisite;
    # the sandbox is empty and skill content cannot mutate external state.
    $skillId = [string](Get-StructuredValue $Event @("part", "state", "input", "name"))
    if ([string]::IsNullOrWhiteSpace($skillId)) {
        $skillId = [string](Get-StructuredValue $Event @("part", "state", "input", "id"))
    }
    if ([string]::IsNullOrWhiteSpace($skillId)) {
        $skillId = [string](Get-StructuredValue $Event @("part", "state", "input", "skill"))
    }
    if ([string]::IsNullOrWhiteSpace($skillId)) {
        throw "NESTED_DELEGATION_FAILED: skill da root sem identificador."
    }
}

function Assert-ExportSkillEntry {
    param(
        [object]$Pair,
        [string]$ExpectedAgent,
        [string]$Label
    )

    $message = Get-ObjectPropertyValue $Pair "Message"
    $entry = Get-ObjectPropertyValue $Pair "Entry"
    if ([string](Get-ObjectPropertyValue $message "type") -cne "assistant" -or
        [string](Get-ObjectPropertyValue $message "agent") -cne $ExpectedAgent) {
        throw "NESTED_DELEGATION_FAILED: skill da sessão $Label não pertence a uma mensagem assistant de $ExpectedAgent."
    }
    if ([string](Get-ObjectPropertyValue $entry "name") -cne "skill") {
        throw "NESTED_DELEGATION_FAILED: tool da sessão $Label esperado=skill ao validar prerequisite."
    }
    # Same beta quirk as subagent calls: completed status is the proof.
    if ([string](Get-StructuredValue $entry @("state", "status")) -cne "completed") {
        throw "NESTED_DELEGATION_FAILED: skill da sessão $Label não está concluída."
    }
    $skillId = [string](Get-StructuredValue $entry @("state", "input", "name"))
    if ([string]::IsNullOrWhiteSpace($skillId)) {
        $skillId = [string](Get-StructuredValue $entry @("state", "input", "id"))
    }
    if ([string]::IsNullOrWhiteSpace($skillId)) {
        $skillId = [string](Get-StructuredValue $entry @("state", "input", "skill"))
    }
    if ([string]::IsNullOrWhiteSpace($skillId)) {
        throw "NESTED_DELEGATION_FAILED: skill da sessão $Label sem identificador."
    }
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

$cli = Resolve-OpenCodeCli
if ($null -eq $cli) { throw "NESTED_DELEGATION_FAILED: OpenCode CLI não encontrado." }

$nonce = [Guid]::NewGuid().ToString("N")
$level1Marker = "NESTED_LEVEL1_$nonce"
$level2Marker = "NESTED_LEVEL2_$nonce"
$prompt = @"
OPERATIONAL NESTED DELEGATION SMOKE. Este é um sandbox temporário vazio, não trabalho de produto.

É proibido ler ou escrever arquivos, usar shell, web, rede, provider externo ou credenciais. Se as instruções de sistema exigirem carregar a skill, é permitido no máximo um `skill(ai-driven-engineering)` por agente como prerequisite não mutante. Fora isso, orchestrator e project-manager só podem usar `subagent` para esta cadeia; tracker-operator não pode usar nenhuma outra ferramenta.

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

    # --format json is JSONL. Parse every line and accept only the observed
    # root tool-use shape; no transcript/prompt text is evidence of a handoff.
    $rootEvents = @(ConvertFrom-StrictJsonLines $rootOutput "root")
    $rootToolEvents = @(Get-RootToolEvents $rootEvents)
    $rootSubagentEvents = @()
    $rootSkillEvents = @()
    foreach ($candidateEvent in $rootToolEvents) {
        $candidateTool = [string](Get-StructuredValue $candidateEvent @("part", "tool"))
        if ($candidateTool -ceq "subagent") {
            $rootSubagentEvents += $candidateEvent
        } elseif ($candidateTool -ceq "skill") {
            $rootSkillEvents += $candidateEvent
        } else {
            throw "NESTED_DELEGATION_FAILED: root usou tool não permitida no smoke: $candidateTool."
        }
    }
    if ($rootSkillEvents.Count -gt 1) {
        throw "NESTED_DELEGATION_FAILED: root carregou skill mais de uma vez; máximo permitido=1."
    }
    if ($rootSkillEvents.Count -eq 1) { Assert-RootSkillEvent $rootSkillEvents[0] }
    # Retries of the mandated handoff are tolerated; a second concurrent
    # orchestrator call is not. Only completed/failed outcomes observed.
    if ($rootSubagentEvents.Count -lt 1) {
        throw "NESTED_DELEGATION_FAILED: root deve conter ao menos um tool-use subagent para project-manager; encontrados $($rootSubagentEvents.Count)."
    }
    $rootEvent = $null
    foreach ($candidate in $rootSubagentEvents) {
        if ([string](Get-StructuredValue $candidate @("part", "state", "status")) -ceq "completed" -and
            [string](Get-StructuredValue $candidate @("part", "state", "input", "agent")) -ceq "project-manager") {
            $rootEvent = $candidate
            break
        }
    }
    if ($null -eq $rootEvent) {
        throw "NESTED_DELEGATION_FAILED: nenhuma chamada subagent da root para project-manager foi concluída."
    }
    $rootSessionId = [string](Get-ObjectPropertyValue $rootEvent "sessionID")
    $pmSessionId = [string](Get-StructuredValue $rootEvent @("part", "state", "metadata", "metadata", "sessionID"))
    if ([string]::IsNullOrWhiteSpace($rootSessionId)) {
        throw "NESTED_DELEGATION_FAILED: evento root de project-manager não contém sessionID da raiz."
    }
    if ([string]::IsNullOrWhiteSpace($pmSessionId)) {
        throw "NESTED_DELEGATION_FAILED: evento root de project-manager não contém sessionID filho no metadata do mesmo evento."
    }

    # `--sanitize` redige state.input e conteúdo text, que são precisamente os
    # campos estruturais verificados abaixo. Export cru é permitido somente neste
    # sandbox novo e vazio, cujo prompt proíbe tools, arquivos, rede e providers.
    # Não há fallback para um export menos protegido fora dessa precondição.
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

    $pmToolEvents = @(Get-ExportToolEntries $pmExport "project-manager")
    $pmSubagentEvents = @()
    $pmSkillEvents = @()
    foreach ($pair in $pmToolEvents) {
        $entry = Get-ObjectPropertyValue $pair "Entry"
        $toolName = [string](Get-ObjectPropertyValue $entry "name")
        if ($toolName -ceq "subagent") {
            $pmSubagentEvents += $pair
        } elseif ($toolName -ceq "skill") {
            $pmSkillEvents += $pair
        } else {
            throw "NESTED_DELEGATION_FAILED: project-manager usou tool não permitida no smoke: $toolName."
        }
    }
    if ($pmSkillEvents.Count -gt 1) {
        throw "NESTED_DELEGATION_FAILED: project-manager carregou skill mais de uma vez; máximo permitido=1."
    }
    if ($pmSkillEvents.Count -eq 1) { Assert-ExportSkillEntry $pmSkillEvents[0] "project-manager" "project-manager" }
    # Completed handoff required; extra failed/retried subagent calls tolerated
    # only when they target the same leaf and completed status is present once.
    $pmCompleted = @($pmSubagentEvents | Where-Object {
        $entry = Get-ObjectPropertyValue $_ "Entry"
        [string](Get-ObjectPropertyValue $entry "name") -ceq "subagent" -and
        [string](Get-StructuredValue $entry @("state", "status")) -ceq "completed" -and
        [string](Get-StructuredValue $entry @("state", "input", "agent")) -ceq "tracker-operator"
    })
    if ($pmCompleted.Count -lt 1) {
        throw "NESTED_DELEGATION_FAILED: nenhuma chamada subagent do project-manager para tracker-operator foi concluída."
    }
    $pair = $pmCompleted[0]
    $pmToolMessage = Get-ObjectPropertyValue $pair "Message"
    $trackerToolEvent = Get-ObjectPropertyValue $pair "Entry"
    if ([string](Get-ObjectPropertyValue $pmToolMessage "type") -cne "assistant" -or
        [string](Get-ObjectPropertyValue $pmToolMessage "agent") -cne "project-manager") {
        throw "NESTED_DELEGATION_FAILED: tool da sessão project-manager não pertence a uma mensagem assistant do project-manager."
    }
    if ([string](Get-ObjectPropertyValue $trackerToolEvent "name") -cne "subagent") {
        throw "NESTED_DELEGATION_FAILED: tool da sessão project-manager não usa subagent."
    }
    # Observed beta schema: a completed subagent call may be exported with
    # executed=false; state.status=completed plus the child session ID in the
    # same event is the reliable proof of execution. Keep completed as the
    # hard requirement instead of trusting the exported flag.
    $trackerStatus = [string](Get-StructuredValue $trackerToolEvent @("state", "status"))
    if ($trackerStatus -cne "completed") {
        throw "NESTED_DELEGATION_FAILED: tool subagent da sessão project-manager não foi executado/concluído (status=$trackerStatus)."
    }
    if ([string](Get-StructuredValue $trackerToolEvent @("state", "status")) -cne "completed") {
        throw "NESTED_DELEGATION_FAILED: tool subagent da sessão project-manager não está concluído."
    }
    if ([string](Get-StructuredValue $trackerToolEvent @("state", "input", "agent")) -cne "tracker-operator") {
        throw "NESTED_DELEGATION_FAILED: tool subagent da sessão project-manager possui target divergente de tracker-operator."
    }
    # Export shape (observed): state.metadata.sessionID. JSONL root shape nests
    # metadata one level deeper; accept both without weakening the binding.
    $trackerSessionId = [string](Get-StructuredValue $trackerToolEvent @("state", "metadata", "sessionID"))
    if ([string]::IsNullOrWhiteSpace($trackerSessionId)) {
        $trackerSessionId = [string](Get-StructuredValue $trackerToolEvent @("state", "metadata", "metadata", "sessionID"))
    }
    if ([string]::IsNullOrWhiteSpace($trackerSessionId)) {
        throw "NESTED_DELEGATION_FAILED: evento tracker-operator não contém sessionID filho no metadata do mesmo evento."
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

    $trackerToolEvents = @(Get-ExportToolEntries $trackerExport "tracker-operator")
    $trackerSkillEvents = @()
    foreach ($pair in $trackerToolEvents) {
        $entry = Get-ObjectPropertyValue $pair "Entry"
        $toolName = [string](Get-ObjectPropertyValue $entry "name")
        if ($toolName -ceq "skill") {
            $trackerSkillEvents += $pair
        } else {
            throw "NESTED_DELEGATION_FAILED: tracker-operator usou tool não permitida no smoke: $toolName."
        }
    }
    if ($trackerSkillEvents.Count -gt 1) {
        throw "NESTED_DELEGATION_FAILED: tracker-operator carregou skill mais de uma vez; máximo permitido=1."
    }
    if ($trackerSkillEvents.Count -eq 1) { Assert-ExportSkillEntry $trackerSkillEvents[0] "tracker-operator" "tracker-operator" }

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
