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

# The server serves the built app: rebuild it when the sources changed since the last build.
$distIndex = Join-Path $runesRoot "dist\index.html"
$sources = @(Get-ChildItem -Path (Join-Path $runesRoot "src") -Recurse -File) + @(Get-Item (Join-Path $runesRoot "index.html"), (Join-Path $runesRoot "package.json"))
$lastSourceChange = ($sources | Measure-Object -Property LastWriteTime -Maximum).Maximum
if (-not (Test-Path $distIndex) -or (Get-Item $distIndex).LastWriteTime -lt $lastSourceChange) {
    if (-not (Test-Command "npm")) {
        throw "Node.js (npm) is required to build runes-dofus. Install Node.js 20+ and run this script again."
    }
    Push-Location $runesRoot
    try {
        if (-not (Test-Path (Join-Path $runesRoot "node_modules"))) {
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
        Pop-Location
    }
}

$env:PYTHONPATH = Join-Path $ocrRoot "src"
& $python @pythonArgs -m dofus_ocr.server --static-dir (Join-Path $runesRoot "dist") @ArgsForServer
exit $LASTEXITCODE
