param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ArgsForCli
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
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

$env:PYTHONPATH = Join-Path $repoRoot "src"
& $python @pythonArgs -m dofus_ocr.cli @ArgsForCli
exit $LASTEXITCODE

