param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ArgsForServer
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Split-Path -Parent $scriptRoot
$launcher = Join-Path $workspaceRoot "start-runes-ocr.ps1"

& $launcher @ArgsForServer
exit $LASTEXITCODE
