param(
    [string]$ProjectRoot = (Get-Location).Path,
    [Parameter(Mandatory=$true)]
    [ValidateSet("status","log","rev-parse","branch","diff-stat","diff-names")]
    [string]$Action,
    [string]$Ref = "HEAD",
    [ValidateRange(1,200)]
    [int]$MaxCount = 30
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-common.ps1")

function Assert-SafeGitRef([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw "Git ref vazio." }
    if ($Value -notmatch '^[0-9A-Za-z._/@~^{}:+-]+(?:\.\.[0-9A-Za-z._/@~^{}:+-]+)?$') {
        throw "Git ref fora do formato permitido: $Value"
    }
}

$root = [IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Projeto não encontrado: $root" }
$git = Get-Command git -ErrorAction SilentlyContinue
if ($null -eq $git) { throw "git não encontrado no PATH." }

$probe = Invoke-ExternalChecked -Command $git.Source -Arguments @('-C',$root,'rev-parse','--is-inside-work-tree') -PassThru
if ((($probe | Out-String).Trim()) -ne 'true') { throw "Diretório não é um Git worktree: $root" }

$args = @('-C',$root)
switch ($Action) {
    'status' {
        $args += @('status','--short','--branch')
    }
    'log' {
        Assert-SafeGitRef $Ref
        $args += @('log','--oneline','--decorate=short',"-$MaxCount",$Ref)
    }
    'rev-parse' {
        Assert-SafeGitRef $Ref
        $args += @('rev-parse',$Ref)
    }
    'branch' {
        $args += @('branch','--show-current')
    }
    'diff-stat' {
        Assert-SafeGitRef $Ref
        $args += @('diff','--stat',$Ref)
    }
    'diff-names' {
        Assert-SafeGitRef $Ref
        $args += @('diff','--name-status',$Ref)
    }
}

$result = Invoke-ExternalChecked -Command $git.Source -Arguments $args -PassThru
$result | ForEach-Object { Write-Output $_ }
