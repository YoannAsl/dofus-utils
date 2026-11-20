param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ArgsForServer
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Join-Path $workspaceRoot "server"
$frontRoot = Join-Path $workspaceRoot "front"
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

$distIndex = Join-Path $frontRoot "dist\index.html"
$sources = @(Get-ChildItem -Path (Join-Path $frontRoot "src") -Recurse -File) + @(Get-Item (Join-Path $frontRoot "index.html"), (Join-Path $frontRoot "package.json"))
$lastSourceChange = ($sources | Measure-Object -Property LastWriteTime -Maximum).Maximum
if (-not (Test-Path $distIndex) -or (Get-Item $distIndex).LastWriteTime -lt $lastSourceChange) {
    if (-not (Test-Command "npm")) {
        throw "Node.js (npm) is required to build the front. Install Node.js 20+ and run this script again."
    }
    Push-Location $frontRoot
    try {
        if (-not (Test-Path (Join-Path $frontRoot "node_modules"))) {
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
        Pop-Location
    }
}

$env:PYTHONPATH = Join-Path $serverRoot "src"
& $python @pythonArgs -m dofus_ocr.server --static-dir (Join-Path $frontRoot "dist") @ArgsForServer
exit $LASTEXITCODE
