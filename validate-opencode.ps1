param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ade = Join-Path $ScriptDir "tooling\ade.py"
$Py = Get-Command py -ErrorAction SilentlyContinue
if ($Py) { & $Py.Source -3 $Ade validate @Args; exit $LASTEXITCODE }
$Python = Get-Command python -ErrorAction SilentlyContinue
if ($Python) { & $Python.Source $Ade validate @Args; exit $LASTEXITCODE }
throw "Python 3.9+ não encontrado."
