$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nested = Join-Path $root 'runtime/nested-delegation-smoke.ps1'
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-nested-delegation-smoke-" + [Guid]::NewGuid().ToString('N'))
$fakeBin = Join-Path $tmp 'bin'
$fakeScript = Join-Path $fakeBin 'fake-opencode2.ps1'
$cwdLog = Join-Path $tmp 'cli-cwds.log'
$oldPath = $env:PATH
$fakeEnvironmentNames = @('FAKE_PROJECT_ROOT', 'FAKE_CWD_LOG', 'FAKE_NESTED_MODE')
$fakeEnvironment = @{}

foreach ($name in $fakeEnvironmentNames) {
    $fakeEnvironment[$name] = [pscustomobject]@{
        Exists = (Test-Path ("Env:" + $name))
        Value = [Environment]::GetEnvironmentVariable($name)
    }
}

function Invoke-FakeNestedProbe {
    param(
        [string]$Mode,
        [string]$Target
    )

    $env:FAKE_NESTED_MODE = $Mode
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $exe -NoProfile -ExecutionPolicy Bypass -File $nested -Target $Target 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = @($output) }
}

function Assert-FakeSandboxCleanup {
    param(
        [string]$Mode,
        [int]$ExpectedCalls
    )

    $locations = @(
        Get-Content -LiteralPath $cwdLog | Where-Object { $_.StartsWith($Mode + '|', [StringComparison]::Ordinal) } | ForEach-Object {
            ($_ -split '\|', 2)[1]
        }
    )
    if ($locations.Count -ne $ExpectedCalls) {
        throw "fake CLI esperava $ExpectedCalls chamadas no sandbox para $Mode; observadas $($locations.Count)"
    }
    foreach ($location in $locations) {
        if (Test-Path -LiteralPath $location) {
            throw "sandbox temporário não foi removido após o probe ${Mode}: $location"
        }
    }
}

New-Item -ItemType Directory -Path $fakeBin -Force | Out-Null
try {
    $fakeBody = @'
$ErrorActionPreference = 'Stop'
$arguments = @($args)

function Fail([string]$Message) {
    [Console]::Error.WriteLine($Message)
    exit 91
}

if ($arguments.Count -eq 0) { Fail 'fake opencode2 sem comando' }
if ($arguments -contains '--dir') { Fail 'fake opencode2 recebeu --dir inválido' }

$cwd = (Get-Location).Path
$expectedProjectRoot = [string]$env:FAKE_PROJECT_ROOT
if ($cwd.Equals($expectedProjectRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Fail 'fake opencode2 recebeu o ProjectRoot real como workspace'
}
if ([IO.Path]::GetFileName($cwd) -notlike 'ai-driven-nested-delegation-*') {
    Fail 'fake opencode2 não foi executado no sandbox exclusivo esperado'
}

$mode = if ([string]::IsNullOrWhiteSpace($env:FAKE_NESTED_MODE)) { 'success' } else { $env:FAKE_NESTED_MODE }
Add-Content -LiteralPath $env:FAKE_CWD_LOG -Value ($mode + '|' + $cwd)

if ([string]$arguments[0] -eq 'run') {
    if ($arguments -notcontains '--format' -or $arguments -notcontains 'json') { Fail 'run sem --format json' }
    # cmd.exe can fragment a multiline final argument before forwarding it to
    # the PowerShell fake. The nonce remains intact in the full argument list.
    $prompt = $arguments -join "`n"
    $nonceMatch = [regex]::Match($prompt, 'NESTED_LEVEL1_([0-9a-f]{32})')
    if (-not $nonceMatch.Success) { Fail 'nonce de nível 1 ausente do prompt' }
    $nonce = $nonceMatch.Groups[1].Value
    $level1 = 'NESTED_LEVEL1_' + $nonce
    $level2 = 'NESTED_LEVEL2_' + $nonce
    $rootSkillEvent = [ordered]@{
        type = 'tool_use'
        sessionID = 'root-' + $nonce
        part = [ordered]@{
            type = 'tool'
            tool = 'skill'
            state = [ordered]@{
                status = 'completed'
                input = [ordered]@{ id = 'ai-driven-engineering' }
            }
        }
    }
    $rootEvent = [ordered]@{
        type = 'tool_use'
        sessionID = 'root-' + $nonce
        part = [ordered]@{
            type = 'tool'
            tool = 'subagent'
            state = [ordered]@{
                status = 'completed'
                input = [ordered]@{ agent = 'project-manager'; prompt = "$level1 $level2" }
                metadata = [ordered]@{ sessionID = 'pm-' + $nonce }
            }
        }
    }
    $rootSkillEvent | ConvertTo-Json -Depth 20 -Compress
    $rootEvent | ConvertTo-Json -Depth 20 -Compress
    if ($mode -eq 'root-retry') {
        $rootEvent | ConvertTo-Json -Depth 20 -Compress
    }
    if ($mode -eq 'root-extra-tool') {
        $extraRootEvent = [ordered]@{
            type = 'tool_use'
            sessionID = 'root-' + $nonce
            part = [ordered]@{
                type = 'tool'
                tool = 'read'
                state = [ordered]@{
                    status = 'completed'
                    input = [ordered]@{ path = 'unexpected' }
                }
            }
        }
        $extraRootEvent | ConvertTo-Json -Depth 20 -Compress
    }
    exit 0
}

if ([string]$arguments[0] -ne 'export') { Fail 'comando fake não suportado' }
if ($arguments -contains '--sanitize') { Fail 'o probe deve usar export cru controlado, não fallback sanitize' }
if ($arguments.Count -ne 2) { Fail 'export fake recebeu argumentos inesperados' }

$sessionId = [string]$arguments[1]
if ($sessionId -like 'pm-*') {
    $nonce = $sessionId.Substring(3)
    $level1 = 'NESTED_LEVEL1_' + $nonce
    $level2 = 'NESTED_LEVEL2_' + $nonce
    $pmText = if ($mode -eq 'markers-in-input-only') { 'sem marcador assistant de nível 1' } else { $level1 }
    $pmSkill = [ordered]@{
        type = 'tool'
        name = 'skill'
        executed = $false
        state = [ordered]@{
            status = 'completed'
            input = [ordered]@{ id = 'ai-driven-engineering' }
        }
    }
    $pmSubagent = [ordered]@{
        type = 'tool'
        name = 'subagent'
        executed = $false
        state = [ordered]@{
            status = 'completed'
            input = [ordered]@{ agent = 'tracker-operator'; prompt = "$level1 $level2" }
            metadata = [ordered]@{ sessionID = 'tracker-' + $nonce }
        }
    }
    $pmContent = @($pmSkill, $pmSubagent)
    if ($mode -eq 'pm-retry') { $pmContent += $pmSubagent }
    $pmContent += [ordered]@{ type = 'text'; text = $pmText }
    if ($mode -eq 'pm-extra-tool') {
        $pmContent += [ordered]@{
            type = 'tool'
            name = 'read'
            executed = $true
            state = [ordered]@{
                status = 'completed'
                input = [ordered]@{ path = 'unexpected' }
            }
        }
    }
    $pmExport = [ordered]@{
        info = [ordered]@{
            id = $sessionId
            parentID = 'root-' + $nonce
            agent = 'project-manager'
            outcome = 'succeeded'
        }
        messages = @(
            [ordered]@{
                type = 'user'
                content = @([ordered]@{ type = 'text'; text = "$level1 $level2" })
            },
            [ordered]@{
                type = 'assistant'
                agent = 'project-manager'
                content = $pmContent
            }
        )
    }
    $pmExport | ConvertTo-Json -Depth 20
    exit 0
}

if ($sessionId -like 'tracker-*') {
    $nonce = $sessionId.Substring(8)
    $level1 = 'NESTED_LEVEL1_' + $nonce
    $level2 = 'NESTED_LEVEL2_' + $nonce
    $trackerText = if ($mode -in @('success','tracker-tool','root-retry','pm-retry','root-extra-tool','pm-extra-tool')) { $level2 } else { 'sem marcador assistant de nível 2' }
    $trackerContent = @(
        [ordered]@{
            type = 'tool'
            name = 'skill'
            executed = $false
            state = [ordered]@{
                status = 'completed'
                input = [ordered]@{ id = 'ai-driven-engineering' }
            }
        },
        [ordered]@{ type = 'text'; text = $trackerText }
    )
    if ($mode -eq 'tracker-tool') {
        $trackerContent += [ordered]@{
            type = 'tool'
            name = 'read'
            executed = $true
            state = [ordered]@{
                status = 'completed'
                input = [ordered]@{ path = 'unexpected' }
            }
        }
    }
    $trackerExport = [ordered]@{
        info = [ordered]@{
            id = $sessionId
            parentID = 'pm-' + $nonce
            agent = 'tracker-operator'
            outcome = 'succeeded'
        }
        messages = @(
            [ordered]@{
                type = 'user'
                content = @([ordered]@{ type = 'text'; text = "$level1 $level2" })
            },
            [ordered]@{
                type = 'assistant'
                agent = 'tracker-operator'
                content = $trackerContent
            }
        )
    }
    $trackerExport | ConvertTo-Json -Depth 20
    exit 0
}

Fail 'session fake desconhecida'
'@
    [System.IO.File]::WriteAllText($fakeScript, $fakeBody, (New-Object System.Text.UTF8Encoding($false)))

    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        # A .cmd wrapper truncates multiline prompts at the first newline.
        # Resolve the fake as a PowerShell script, like the installed CLI.
        $fake = Join-Path $fakeBin 'opencode2.ps1'
        [System.IO.File]::WriteAllText($fake, $fakeBody, (New-Object System.Text.UTF8Encoding($false)))
    } else {
        $fake = Join-Path $fakeBin 'opencode2'
        $wrapper = @'
#!/bin/sh
exec "__PWSH_EXE__" -NoProfile -File "$(dirname "$0")/fake-opencode2.ps1" "$@"
'@
        $wrapper = $wrapper.Replace('__PWSH_EXE__', $exe)
        [System.IO.File]::WriteAllText($fake, $wrapper, (New-Object System.Text.UTF8Encoding($false)))
        & chmod +x $fake
        if ($LASTEXITCODE -ne 0) { throw 'não foi possível tornar fake opencode2 executável' }
    }

    $env:PATH = $fakeBin + [IO.Path]::PathSeparator + $oldPath
    $env:FAKE_PROJECT_ROOT = $root
    $env:FAKE_CWD_LOG = $cwdLog
    $target = Join-Path $tmp 'config'
    New-Item -ItemType Directory -Path $target -Force | Out-Null

    $success = Invoke-FakeNestedProbe 'success' $target
    if ($success.ExitCode -ne 0) {
        throw "nested probe com CLI fake falhou: $($success.Output | Out-String)"
    }
    if (($success.Output | Out-String) -notmatch 'NESTED_DELEGATION_OK') {
        throw 'nested probe fake não reportou NESTED_DELEGATION_OK'
    }
    Assert-FakeSandboxCleanup 'success' 3

    $rootRetry = Invoke-FakeNestedProbe 'root-retry' $target
    if ($rootRetry.ExitCode -ne 0 -or ($rootRetry.Output | Out-String) -notmatch 'NESTED_DELEGATION_OK') {
        throw 'nested probe rejeitou retry idêntico do handoff root -> project-manager'
    }
    Assert-FakeSandboxCleanup 'root-retry' 3

    $pmRetry = Invoke-FakeNestedProbe 'pm-retry' $target
    if ($pmRetry.ExitCode -ne 0 -or ($pmRetry.Output | Out-String) -notmatch 'NESTED_DELEGATION_OK') {
        throw 'nested probe rejeitou retry idêntico do handoff project-manager -> tracker-operator'
    }
    Assert-FakeSandboxCleanup 'pm-retry' 3

    # Both nonces occur in user/prompt/tool input, but neither assistant text
    # contains them. A raw transcript search would be a false positive.
    $inputOnly = Invoke-FakeNestedProbe 'markers-in-input-only' $target
    if ($inputOnly.ExitCode -eq 0) {
        throw 'nested probe aceitou markers presentes somente em prompt/input'
    }
    if (($inputOnly.Output | Out-String) -notmatch 'conteúdo text de mensagem assistant do project-manager') {
        throw 'falha negativa não exigiu marcador em texto assistant do project-manager'
    }
    Assert-FakeSandboxCleanup 'markers-in-input-only' 3

    # Exercise the tracker-specific marker restriction after a valid PM marker.
    $trackerInputOnly = Invoke-FakeNestedProbe 'tracker-marker-in-input-only' $target
    if ($trackerInputOnly.ExitCode -eq 0) {
        throw 'nested probe aceitou marker do tracker presente somente em prompt/input'
    }
    if (($trackerInputOnly.Output | Out-String) -notmatch 'conteúdo text de mensagem assistant do tracker-operator') {
        throw 'falha negativa não exigiu marcador em texto assistant do tracker-operator'
    }
    Assert-FakeSandboxCleanup 'tracker-marker-in-input-only' 3

    $rootExtraTool = Invoke-FakeNestedProbe 'root-extra-tool' $target
    if ($rootExtraTool.ExitCode -eq 0) {
        throw 'nested probe aceitou tool extra na root'
    }
    if (($rootExtraTool.Output | Out-String) -notmatch 'root usou tool não permitida no smoke') {
        throw 'falha negativa não rejeitou tool extra na root'
    }
    Assert-FakeSandboxCleanup 'root-extra-tool' 1

    $pmExtraTool = Invoke-FakeNestedProbe 'pm-extra-tool' $target
    if ($pmExtraTool.ExitCode -eq 0) {
        throw 'nested probe aceitou tool extra no project-manager'
    }
    if (($pmExtraTool.Output | Out-String) -notmatch 'project-manager usou tool não permitida no smoke') {
        throw 'falha negativa não rejeitou tool extra no project-manager'
    }
    Assert-FakeSandboxCleanup 'pm-extra-tool' 2

    $trackerTool = Invoke-FakeNestedProbe 'tracker-tool' $target
    if ($trackerTool.ExitCode -eq 0) {
        throw 'nested probe aceitou tool no tracker-operator'
    }
    if (($trackerTool.Output | Out-String) -notmatch 'tracker-operator usou tool não permitida no smoke') {
        throw 'falha negativa não rejeitou tool no tracker-operator'
    }
    Assert-FakeSandboxCleanup 'tracker-tool' 3

    Write-Host 'Nested delegation structural parser/sandbox: OK'
} finally {
    foreach ($name in $fakeEnvironmentNames) {
        if ($fakeEnvironment[$name].Exists) {
            Set-Item -Path ("Env:" + $name) -Value $fakeEnvironment[$name].Value
        } else {
            Remove-Item ("Env:" + $name) -ErrorAction SilentlyContinue
        }
    }
    $env:PATH = $oldPath
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
