param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ArgsForServer
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ocrRoot = Join-Path $workspaceRoot "dofus-ocr"
$runesRoot = Join-Path $workspaceRoot "runes-dofus"
$bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

function Test-Command($Name) {
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if (Test-Path $bundledPython) {
    $python = $bundledPython
    $pythonArgs = @()
} elseif (Test-Command "python") {
    $python = "python"
    $pythonArgs = @()
} elseif (Test-Command "py") {
    $python = "py"
    $pythonArgs = @("-3")
} else {
    throw "Python 3 was not found. Install Python 3.10+ or run from Codex where the bundled runtime is available."
}

$env:PYTHONPATH = Join-Path $ocrRoot "src"
& $python @pythonArgs -m dofus_ocr.server --static-dir $runesRoot @ArgsForServer
exit $LASTEXITCODE
