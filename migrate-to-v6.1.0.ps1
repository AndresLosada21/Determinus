$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& py -B (Join-Path $Root 'tooling\ade.py') migrate @args
exit $LASTEXITCODE
