param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ade = Join-Path $ScriptDir "..\tooling\ade.py"
$Py = Get-Command py -ErrorAction SilentlyContinue
if ($Py) { & $Py.Source -3 $Ade engineering-recovery-smoke @Args; exit $LASTEXITCODE }
$Python = Get-Command python -ErrorAction SilentlyContinue
if ($Python) { & $Python.Source $Ade engineering-recovery-smoke @Args; exit $LASTEXITCODE }
throw "Python 3.9+ não encontrado. Instale Python ou use diretamente: python ..\tooling\ade.py engineering-recovery-smoke"
