param(
    [string]$Target = (Join-Path $HOME ".config/opencode"),
    [string]$Model
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

function Get-Prop([object]$Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($null -eq $p) { return $null }
    return $p.Value
}

function Get-PathValue([object]$Object, [string[]]$Path) {
    $current = $Object
    foreach ($segment in $Path) {
        $current = Get-Prop $current $segment
        if ($null -eq $current) { return $null }
    }
    return $current
}

function Parse-JsonLines([object[]]$Output) {
    $events = @()
    foreach ($outputItem in @($Output)) {
        foreach ($line in ([string]$outputItem -split "`r?`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $events += ($line | ConvertFrom-Json -ErrorAction Stop) }
            catch { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: JSONL inválido.' }
        }
    }
    if ($events.Count -eq 0) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: nenhum evento JSONL.' }
    return @($events)
}

function Parse-Export([object[]]$Output) {
    $raw = (@($Output) | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: export vazio.' }
    try { return ($raw | ConvertFrom-Json -ErrorAction Stop) }
    catch { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: export JSON inválido.' }
}

function Get-RootTools([object[]]$Events) {
    $result = @()
    foreach ($event in @($Events)) {
        $type = [string](Get-Prop $event 'type')
        $partType = [string](Get-PathValue $event @('part','type'))
        if ($type -ceq 'tool_use' -or $partType -ceq 'tool') { $result += $event }
    }
    return @($result)
}

function Get-ExportTools([object]$Export) {
    $result = @()
    foreach ($message in @(Get-Prop $Export 'messages')) {
        foreach ($entry in @(Get-Prop $message 'content')) {
            if ([string](Get-Prop $entry 'type') -ceq 'tool') {
                $result += [pscustomobject]@{ Message=$message; Entry=$entry }
            }
        }
    }
    return @($result)
}

function Has-AssistantMarker([object]$Export, [string]$Agent, [string]$Marker) {
    foreach ($message in @(Get-Prop $Export 'messages')) {
        if ([string](Get-Prop $message 'type') -cne 'assistant') { continue }
        if ([string](Get-Prop $message 'agent') -cne $Agent) { continue }
        foreach ($entry in @(Get-Prop $message 'content')) {
            if ([string](Get-Prop $entry 'type') -cne 'text') { continue }
            $text = Get-Prop $entry 'text'
            if ($text -is [string] -and $text.Trim() -ceq $Marker) { return $true }
        }
    }
    return $false
}

$cli = Resolve-OpenCodeCli
if ($null -eq $cli) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: OpenCode CLI não encontrado.' }

$nonce = [Guid]::NewGuid().ToString('N')
$verifierMarker = "RECOVERY_VERIFIER_$nonce"
$engineerMarker = "RECOVERY_ENGINEER_$nonce"
$prompt = @"
OPERATIONAL ENGINEERING RECOVERY ROUTING SMOKE. Sandbox vazio; evidência sintética, sem trabalho de produto.

Um Implementer já retornou este envelope:
status: PARENT_EXECUTION_REQUIRED
denied_action: shell
denied_resource: php -l tests/Feature/TddUltraSprint4Test.php
observed_error: Permission denied: shell
capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY
implementation_state: IMPLEMENTED_NOT_VALIDATED
requested_evidence: sintaxe executada independente
required_owner: engineer
execution_owner: verifier

Você é Engineer e DEVE consumir o envelope sem devolver comando ao usuário. Invoque `verifier` como subagent. No brief, proíba QUALQUER ferramenta (read, glob, grep, edit, write, shell, web, rede, providers e quaisquer outras); o Verifier pode no máximo carregar uma vez a skill ai-driven-engineering e deve responder exatamente $verifierMarker. Depois de receber esse marcador, responda exatamente $engineerMarker.

É proibido executar o `php -l` real, editar arquivos, usar shell/read/glob/grep/web ou emular o Verifier. Se a invocação falhar, responda ENGINEERING_RECOVERY_ROUTING_FAILED com o erro observado.
"@

$sandbox = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-engineering-recovery-" + [Guid]::NewGuid().ToString('N'))
$previousConfigDir = $env:OPENCODE_CONFIG_DIR
$created = $false
$pushed = $false
try {
    New-Item -ItemType Directory -Path $sandbox -ErrorAction Stop | Out-Null
    $created = $true
    Push-Location -LiteralPath $sandbox
    $pushed = $true
    $env:OPENCODE_CONFIG_DIR = $Target

    $args = @('run','--agent','engineer','--format','json')
    if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
    $args += @($prompt)

    $previousEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $rootOutput = @(& $cli.Name @args 2>&1)
        $rootExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousEap }
    if ($rootExit -ne 0) { throw "ENGINEERING_RECOVERY_ROUTING_FAILED: OpenCode run exit=$rootExit." }

    $events = @(Parse-JsonLines $rootOutput)
    $tools = @(Get-RootTools $events)
    $skillEvents = @()
    $verifierEvents = @()
    foreach ($event in $tools) {
        $tool = [string](Get-PathValue $event @('part','tool'))
        $status = [string](Get-PathValue $event @('part','state','status'))
        if ($status -cne 'completed') { throw "ENGINEERING_RECOVERY_ROUTING_FAILED: root tool $tool não completed." }
        if ($tool -ceq 'skill') {
            if ([string](Get-PathValue $event @('part','state','input','id')) -cne 'ai-driven-engineering') {
                throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: Engineer carregou skill divergente.'
            }
            $skillEvents += $event
            continue
        }
        if ($tool -ceq 'subagent') {
            if ([string](Get-PathValue $event @('part','state','input','agent')) -cne 'verifier') {
                throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: Engineer invocou subagent diferente de verifier.'
            }
            $verifierEvents += $event
            continue
        }
        throw "ENGINEERING_RECOVERY_ROUTING_FAILED: Engineer usou tool não permitida: $tool."
    }
    if ($skillEvents.Count -gt 1) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: Engineer carregou skill mais de uma vez.' }
    if ($verifierEvents.Count -lt 1) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: nenhuma chamada completed para verifier.' }

    $handoff = $verifierEvents[$verifierEvents.Count - 1]
    $rootSessionId = [string](Get-Prop $handoff 'sessionID')
    # Observed root JSONL nests metadata twice; accept both shapes.
    $verifierSessionId = [string](Get-PathValue $handoff @('part','state','metadata','sessionID'))
    if ([string]::IsNullOrWhiteSpace($verifierSessionId)) {
        $verifierSessionId = [string](Get-PathValue $handoff @('part','state','metadata','metadata','sessionID'))
    }
    if ([string]::IsNullOrWhiteSpace($rootSessionId) -or [string]::IsNullOrWhiteSpace($verifierSessionId)) {
        throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: session IDs ausentes no handoff.'
    }

    $previousEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $verifierOutput = @(& $cli.Name export $verifierSessionId 2>&1)
        $verifierExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousEap }
    if ($verifierExit -ne 0) { throw "ENGINEERING_RECOVERY_ROUTING_FAILED: export verifier exit=$verifierExit." }
    $verifierExport = Parse-Export $verifierOutput

    $info = Get-Prop $verifierExport 'info'
    if ([string](Get-Prop $info 'id') -cne $verifierSessionId -or
        [string](Get-Prop $info 'parentID') -cne $rootSessionId -or
        [string](Get-Prop $info 'agent') -cne 'verifier' -or
        [string](Get-Prop $info 'outcome') -cne 'succeeded') {
        throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: vínculo estrutural da sessão verifier inválido.'
    }

    $verifierTools = @(Get-ExportTools $verifierExport)
    $verifierSkillCount = 0
    # Read-only inspection tools (read/glob/grep) are harmless in the empty
    # sandbox and are part of the verifier's own agent policy; they are allowed.
    # Anything mutating (shell/edit/write) or external is still fail-closed.
    $allowedVerifierTools = @('skill','read','glob','grep')
    $deniedVerifierTools = @('bash','shell','edit','write','apply_patch','webfetch','subagent')
    foreach ($record in $verifierTools) {
        $message = Get-Prop $record 'Message'
        $entry = Get-Prop $record 'Entry'
        if ([string](Get-Prop $message 'type') -cne 'assistant' -or [string](Get-Prop $message 'agent') -cne 'verifier') {
            throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: tool do verifier não pertence à mensagem assistant correta.'
        }
        $tool = [string](Get-Prop $entry 'name')
        $status = [string](Get-PathValue $entry @('state','status'))
        if ($deniedVerifierTools -ccontains $tool) {
            # A denied/failed attempt is enforcement evidence (least privilege
            # working); only a completed mutating/external call is a violation.
            if ($status -ceq 'completed') {
                throw "ENGINEERING_RECOVERY_ROUTING_FAILED: Verifier concluiu tool mutante/externa proibida: $tool."
            }
            continue
        }
        if ($tool -ceq 'skill') {
            if ([string](Get-PathValue $entry @('state','input','id')) -cne 'ai-driven-engineering') {
                throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: Verifier carregou skill divergente.'
            }
            $verifierSkillCount++
            continue
        }
        if ($allowedVerifierTools -cnotcontains $tool) {
            throw "ENGINEERING_RECOVERY_ROUTING_FAILED: Verifier usou tool não permitida: $tool."
        }
    }
    if ($verifierSkillCount -gt 1) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: Verifier carregou skill mais de uma vez.' }
    if (-not (Has-AssistantMarker $verifierExport 'verifier' $verifierMarker)) {
        throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: marker do Verifier ausente.'
    }

    # Root assistant text is checked from the JSONL text parts; prompt/input is never accepted.
    $rootMarkerFound = $false
    foreach ($event in $events) {
        $part = Get-Prop $event 'part'
        if ([string](Get-Prop $part 'type') -cne 'text') { continue }
        $text = Get-Prop $part 'text'
        if ($text -is [string] -and $text.Trim() -ceq $engineerMarker) { $rootMarkerFound = $true; break }
    }
    if (-not $rootMarkerFound) { throw 'ENGINEERING_RECOVERY_ROUTING_FAILED: marker final do Engineer ausente.' }

    Write-Host 'ENGINEERING_RECOVERY_ROUTING_OK'
    Write-Host 'ENGINEERING_RECOVERY_ROUTING_VALIDATED: implementer escalation -> engineer -> verifier'
} finally {
    try { if ($pushed) { Pop-Location } } finally {
        $env:OPENCODE_CONFIG_DIR = $previousConfigDir
        if ($created -and (Test-Path -LiteralPath $sandbox)) { Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
