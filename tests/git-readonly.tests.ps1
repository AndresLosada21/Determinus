$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$script = Join-Path $root 'runtime/git-readonly.ps1'
$git = Get-Command git -ErrorAction SilentlyContinue
if ($null -eq $git) { Write-Host 'SKIP: git não encontrado'; exit 0 }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ai-git-readonly-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    & git -C $tmp init | Out-Null
    & git -C $tmp config user.email 'tests@example.invalid'
    & git -C $tmp config user.name 'AI Tests'
    Set-Content -LiteralPath (Join-Path $tmp 'a.txt') -Value 'one' -Encoding UTF8
    & git -C $tmp add a.txt
    & git -C $tmp commit -m 'init' | Out-Null
    $log = @(& $script -ProjectRoot $tmp -Action log -MaxCount 5 2>&1)
    if ($LASTEXITCODE -ne 0 -or (($log | Out-String) -notmatch 'init')) { throw 'git-readonly log falhou' }
    Add-Content -LiteralPath (Join-Path $tmp 'a.txt') -Value 'two'
    $status = @(& $script -ProjectRoot $tmp -Action status 2>&1)
    if ((($status | Out-String) -notmatch 'a.txt')) { throw 'git-readonly status não reportou modificação' }
    $blocked = $false
    try { & $script -ProjectRoot $tmp -Action log -Ref 'HEAD;whoami' 2>$null | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { throw 'Git ref com shell metachar deveria ser rejeitado' }
    Write-Host 'Git readonly wrapper: OK'
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
