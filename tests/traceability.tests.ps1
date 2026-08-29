$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-driven-trace-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    & $exe -NoProfile -File (Join-Path $root 'runtime/bootstrap-project.ps1') -ProjectRoot $tmp -WorkItemId 'TRACE-1' -Profile STANDARD
    if ($LASTEXITCODE -ne 0) { throw 'bootstrap falhou' }

    foreach ($caseArgs in @(
        @('-Action','link-external','-Provider','github','-ExternalId','123','-ExternalKey','GH-123','-Url','https://github.com/example/repo/issues/123'),
        @('-Action','link-branch','-Value','feat/TRACE-1'),
        @('-Action','link-commit','-Value','0123456789abcdef'),
        @('-Action','link-pr','-Provider','github','-ExternalId','456','-Url','https://github.com/example/repo/pull/456'),
        @('-Action','link-evidence','-EvidenceType','test','-Value','tests:passed')
    )) {
        & $exe -NoProfile -File (Join-Path $root 'runtime/traceability.ps1') -ProjectRoot $tmp @caseArgs
        if ($LASTEXITCODE -ne 0) { throw "traceability action falhou: $($caseArgs -join ' ')" }
    }

    # Dedup branch
    & $exe -NoProfile -File (Join-Path $root 'runtime/traceability.ps1') -ProjectRoot $tmp -Action link-branch -Value 'feat/TRACE-1'
    if ($LASTEXITCODE -ne 0) { throw 'dedup call falhou' }

    $trace = Get-Content -LiteralPath (Join-Path $tmp '.ai/traceability.json') -Raw | ConvertFrom-Json
    if ([string]$trace.work_item_id -ne 'TRACE-1') { throw 'work_item_id incorreto' }
    if (@($trace.external).Count -ne 1) { throw 'external link count incorreto' }
    if (@($trace.branches).Count -ne 1) { throw 'branch deveria ser deduplicada' }
    if (@($trace.commits).Count -ne 1) { throw 'commit ausente' }
    if (@($trace.pull_requests).Count -ne 1) { throw 'PR ausente' }
    if (@($trace.evidence).Count -ne 1) { throw 'evidence ausente' }

    $audit = Join-Path $tmp '.ai/audit.jsonl'
    if (-not (Test-Path -LiteralPath $audit)) { throw 'audit.jsonl ausente' }
    $lines = @(Get-Content -LiteralPath $audit | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($lines.Count -lt 5) { throw 'audit não registrou ações de traceability' }
    foreach ($line in $lines) { $null = $line | ConvertFrom-Json }

    Write-Host 'Traceability/audit: OK'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
