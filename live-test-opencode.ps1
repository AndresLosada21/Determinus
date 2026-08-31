$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Py = Get-Command py -ErrorAction SilentlyContinue
if ($Py) { & py -B "$Root\live-test-opencode.py" @args; exit $LASTEXITCODE }
$Python = Get-Command python -ErrorAction SilentlyContinue
if (-not $Python) { throw "Python 3.11+ não encontrado." }
& python -B "$Root\live-test-opencode.py" @args
exit $LASTEXITCODE
