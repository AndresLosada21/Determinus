$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& (Join-Path $root 'runtime/static-policy-check.ps1') -PackageRoot $root
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
