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

function Get-AssistantTextFromJsonLines([object[]]$Output) {
    $texts = New-Object System.Collections.Generic.List[string]
    foreach ($outputItem in @($Output)) {
        foreach ($line in ([string]$outputItem -split "`r?`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try { $event = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }
            $part = Get-Prop $event 'part'
            if ($null -eq $part) { continue }
            if ([string](Get-Prop $part 'type') -cne 'text') { continue }
            $text = Get-Prop $part 'text'
            if ($text -is [string] -and -not [string]::IsNullOrWhiteSpace($text)) { $texts.Add($text) }
        }
    }
    return ($texts -join [Environment]::NewLine)
}

$cli = Resolve-OpenCodeCli
if ($null -eq $cli) { throw "CAPABILITY_RECOVERY_FAILED: OpenCode CLI não encontrado." }

# Subprocess output arrives decoded via the OEM code page, producing mojibake
# for non-ASCII text and breaking literal field matching. Force UTF-8.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-RecoveryScenario(
    [string]$Agent,
    [string]$Prompt,
    [string[]]$Required,
    [string]$Scenario
) {
    $sandbox = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-capability-recovery-" + $Scenario + "-" + [Guid]::NewGuid().ToString('N'))
    $previousConfigDir = $env:OPENCODE_CONFIG_DIR
    $created = $false
    $pushed = $false
    try {
        New-Item -ItemType Directory -Path $sandbox -ErrorAction Stop | Out-Null
        $created = $true
        Push-Location -LiteralPath $sandbox
        $pushed = $true
        $env:OPENCODE_CONFIG_DIR = $Target

        $args = @('run','--agent',$Agent,'--format','json')
        if (-not [string]::IsNullOrWhiteSpace($Model)) { $args += @('--model',$Model) }
        $args += @($Prompt)

        $previousEap = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $output = @(& $cli.Name @args 2>&1)
            $code = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousEap
        }
        if ($code -ne 0) { throw "CAPABILITY_RECOVERY_FAILED[$Scenario]: OpenCode run falhou (exit=$code)." }

        $text = Get-AssistantTextFromJsonLines $output
        # Stream JSONL can end before later text parts are flushed. The session
        # export is the authoritative transcript: resolve sessionID from the
        # events and validate against it, falling back to the stream text.
        try {
            $sessionEvent = @($output) | ForEach-Object {
                foreach ($line in ([string]$_ -split "`r?`n")) {
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    try { return ($line | ConvertFrom-Json -ErrorAction Stop) } catch { }
                }
            } | Where-Object { -not [string]::IsNullOrWhiteSpace([string](Get-Prop $_ 'sessionID')) } | Select-Object -First 1
            $sessionId = [string](Get-Prop $sessionEvent 'sessionID')
        } catch { $sessionId = '' }
        $exportReplaced = $false
        if (-not [string]::IsNullOrWhiteSpace($sessionId)) {
            $previousEap2 = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                $exportOutput = @(& $cli.Name export $sessionId 2>&1)
                $exportExit = $LASTEXITCODE
            } finally { $ErrorActionPreference = $previousEap2 }
            if ($exportExit -eq 0) {
                try {
                    $exportRaw = ($exportOutput | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
                    $export = $null
                    try { $export = $exportRaw | ConvertFrom-Json -ErrorAction Stop } catch {
                        # stderr lines merged via 2>&1 can corrupt the JSON; slice
                        # from the first '{' to the last '}' and retry once.
                        $first = $exportRaw.IndexOf('{')
                        $last = $exportRaw.LastIndexOf('}')
                        if ($first -ge 0 -and $last -gt $first) {
                            $export = $exportRaw.Substring($first, $last - $first + 1) | ConvertFrom-Json -ErrorAction Stop
                        }
                    }
                    $exportTexts = @()
                    foreach ($message in @((Get-Prop $export 'messages'))) {
                        if ([string](Get-Prop $message 'type') -cne 'assistant') { continue }
                        foreach ($entry in @((Get-Prop $message 'content'))) {
                            if ([string](Get-Prop $entry 'type') -cne 'text') { continue }
                            $t = Get-Prop $entry 'text'
                            if ($t -is [string] -and -not [string]::IsNullOrWhiteSpace($t)) { $exportTexts += $t }
                        }
                    }
                    if ($exportTexts.Count -gt 0) { $text = ($exportTexts -join [Environment]::NewLine); $exportReplaced = $true }
                } catch {
                    $exportError = $_.Exception.Message
                }
            }
        }
        # Strip markdown emphasis/code markers only. Underscores must survive:
        # required fields and markers are snake_case (e.g. CAPABILITY_DENIAL_RECOVERY_OK).
        $normalized = $text -replace '[*`]', ''
        $diagnostics = "sessionid_present=$([bool]$sessionId) export_replaced=$exportReplaced export_error=$exportError text_len=$($text.Length) raw_marker=$($text.Contains('CAPABILITY_DENIAL_RECOVERY_OK')) norm_marker=$($normalized.Contains('CAPABILITY_DENIAL_RECOVERY_OK'))"
        foreach ($required in $Required) {
            if ($normalized -notmatch [regex]::Escape($required)) { throw "CAPABILITY_RECOVERY_FAILED[$Scenario]: resposta não contém $required ($diagnostics)" }
        }
        if ($normalized -match '(?i)shell\s+(?:está\s+)?indisponível|shell\s+unavailable|github\s+(?:está\s+)?indisponível|all\s+tools\s+unavailable') {
            throw "CAPABILITY_RECOVERY_FAILED[$Scenario]: resposta generalizou um deny específico para indisponibilidade global."
        }
        if ($normalized -match '(?i)(rode|execute|run)\s+(?:manualmente\s+)?(?:o\s+)?(?:comando|php|gh|docker)') {
            throw "CAPABILITY_RECOVERY_FAILED[$Scenario]: resposta devolveu execução manual ao usuário."
        }
        Write-Host "CAPABILITY_RECOVERY_SCENARIO_OK: $Scenario"
    } finally {
        try { if ($pushed) { Pop-Location } } finally {
            $env:OPENCODE_CONFIG_DIR = $previousConfigDir
            if ($created -and (Test-Path -LiteralPath $sandbox)) { Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
}

$explorerPrompt = @'
CAPABILITY DENIAL RECOVERY SMOKE. Não execute tools; classifique apenas a evidência fornecida.

EVIDÊNCIA OBSERVADA:
- agent: explorer
- attempted_action: shell
- attempted_resource: gh issue view 95 --json number,title,body,state,labels,milestone
- observed_error: Permission denied: shell
- requested_evidence: body/state/labels/milestone da issue 95 para discovery técnico

Responda de acordo com a policy ai-driven-engineering. A resposta deve explicitar que o deny vale só para a tentativa concreta, não para todo shell; deve escalar evidência externa para o owner correto sem fornecer comando manual ao usuário.
Inclua literalmente estes campos/valores:
CAPABILITY_DENIAL_RECOVERY_OK
capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY
status: PARENT_EXECUTION_REQUIRED
required_owner: project-manager
execution_owner: tracker-operator

Não diga que shell, GitHub ou todas as tools estão indisponíveis.
'@
Invoke-RecoveryScenario -Agent 'explorer' -Scenario 'explorer-cross-plane' -Prompt $explorerPrompt -Required @(
    'CAPABILITY_DENIAL_RECOVERY_OK',
    'capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY',
    'status: PARENT_EXECUTION_REQUIRED',
    'required_owner: project-manager',
    'execution_owner: tracker-operator'
)

$implementerPrompt = @'
CAPABILITY DENIAL RECOVERY SMOKE. Não execute tools; classifique apenas a evidência fornecida.

EVIDÊNCIA OBSERVADA:
- agent: implementer
- implementation_status: mudança de teste criada dentro do escopo
- attempted_action: shell
- attempted_resource: php -l dreamfactory-fork/tests/Feature/TddUltraSprint4Test.php
- observed_error: Permission denied: shell
- requested_evidence: sintaxe PHP executada e independente antes de promover a mudança

Responda de acordo com a policy ai-driven-engineering. O deny vale apenas para a tentativa concreta. A implementação deve permanecer não validada e a evidência deve ser roteada dentro do Engineering Plane para o Verifier, sem fornecer comando manual ao usuário.
Inclua literalmente estes campos/valores:
CAPABILITY_DENIAL_RECOVERY_OK
capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY
implementation_state: IMPLEMENTED_NOT_VALIDATED
status: PARENT_EXECUTION_REQUIRED
required_owner: engineer
execution_owner: verifier

Não diga que shell ou todas as tools estão indisponíveis e não declare VALIDATED/ENGINEERING_ACCEPTED.
'@
Invoke-RecoveryScenario -Agent 'implementer' -Scenario 'implementer-to-verifier' -Prompt $implementerPrompt -Required @(
    'CAPABILITY_DENIAL_RECOVERY_OK',
    'capability_scope: SPECIFIC_ACTION_RESOURCE_ONLY',
    'implementation_state: IMPLEMENTED_NOT_VALIDATED',
    'status: PARENT_EXECUTION_REQUIRED',
    'required_owner: engineer',
    'execution_owner: verifier'
)

Write-Host 'CAPABILITY_DENIAL_RECOVERY_OK'
Write-Host 'CAPABILITY_RECOVERY_VALIDATED: explorer->PM/tracker + implementer->engineer/verifier; no global denial inference or manual hand-back'
