param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("launch", "doctor", "stop")]
    [string] $Command,
    [int] $Port = 8799
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$frontRoot = Join-Path $repoRoot "front"
$serverSrc = Join-Path $repoRoot "server\src"
$distDir = Join-Path $frontRoot "dist"
$runDir = Join-Path $repoRoot ".verify\run"
$pidFile = Join-Path $runDir "server.pid"
$portFile = Join-Path $runDir "server.port"
$launcherFile = Join-Path $runDir "launcher.pid"
$logFile = Join-Path $runDir "server.log"
$errFile = Join-Path $runDir "server.err.log"

function Get-Python {
    $found = Get-Command python -ErrorAction SilentlyContinue
    if ($found) { return , @($found.Source) }
    $found = Get-Command py -ErrorAction SilentlyContinue
    if ($found) { return , @($found.Source, "-3") }
    throw "Python 3 was not found."
}

function Test-DistStale {
    $index = Join-Path $distDir "index.html"
    if (-not (Test-Path $index)) { return $true }
    $sources = @(Get-ChildItem -Path (Join-Path $frontRoot "src") -Recurse -File) + @(Get-Item (Join-Path $frontRoot "index.html"), (Join-Path $frontRoot "package.json"))
    $latest = ($sources | Measure-Object -Property LastWriteTime -Maximum).Maximum
    return (Get-Item $index).LastWriteTime -lt $latest
}

function Get-Health([int] $TargetPort) {
    try {
        return Invoke-RestMethod -Uri "http://127.0.0.1:$TargetPort/api/health" -TimeoutSec 3
    } catch {
        return $null
    }
}

function Get-PortOwner([int] $TargetPort) {
    $line = netstat -ano | Select-String -Pattern "^\s*TCP\s+127\.0\.0\.1:$TargetPort\s+\S+\s+LISTENING\s+(\d+)" | Select-Object -First 1
    if ($line) { return [int]$line.Matches[0].Groups[1].Value }
    return $null
}

function Test-DescendsFrom($ChildId, [int] $AncestorId) {
    $current = $ChildId
    for ($depth = 0; $current -and $depth -lt 5; $depth++) {
        if ($current -eq $AncestorId) { return $true }
        $current = (Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction SilentlyContinue).ParentProcessId
    }
    return $false
}

function Invoke-Doctor {
    $problems = @()
    if (-not (Test-Path $pidFile)) {
        Write-Output "FAIL no instance started by this skill (.verify\run\server.pid missing). Run launch."
        exit 1
    }
    $serverPid = [int](Get-Content $pidFile)
    $runPort = [int](Get-Content $portFile)
    $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if (-not $process) { $problems += "process $serverPid is not running" }
    $owner = Get-PortOwner $runPort
    if ($owner -ne $serverPid) { $problems += "port $runPort is owned by pid '$owner', not by our server $serverPid" }
    $health = Get-Health $runPort
    if (-not $health -or -not $health.ok) {
        $problems += "GET /api/health on port $runPort did not answer ok"
    } else {
        $expected = (Resolve-Path (Join-Path $serverSrc "dofus_ocr\server.py")).Path
        if ($health.server_file -ne $expected) { $problems += "server_file is $($health.server_file), expected $expected" }
    }
    try {
        $page = Invoke-WebRequest -Uri "http://127.0.0.1:$runPort/brisage" -UseBasicParsing -TimeoutSec 3
        if ($page.Content -notmatch '<div id="root">') { $problems += "/brisage did not serve the app shell" }
    } catch {
        $problems += "/brisage did not answer"
    }
    if (Test-DistStale) { $problems += "front/dist is older than front/src: stop, then launch again to rebuild" }
    if ($problems.Count) {
        $problems | ForEach-Object { Write-Output "FAIL $_" }
        exit 1
    }
    Write-Output "OK pid=$serverPid url=http://127.0.0.1:$runPort/ server_file=$($health.server_file) commit=$(git -C $repoRoot rev-parse --short HEAD)"
}

function Invoke-Launch {
    if (Test-Path $pidFile) {
        $existing = [int](Get-Content $pidFile)
        if (Get-Process -Id $existing -ErrorAction SilentlyContinue) {
            throw "An instance started by this skill is already running (pid $existing). Run doctor, or stop it first."
        }
        Remove-Item $runDir -Recurse -Force
    }
    $owner = Get-PortOwner $Port
    if ($owner) { throw "Port $Port is already used by pid $owner, which this skill did not start. Pick another with -Port." }

    if (Test-DistStale) {
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

    New-Item -ItemType Directory -Force $runDir | Out-Null
    $python = Get-Python
    $pythonCommand = (@("`"$($python[0])`"") + @($python | Select-Object -Skip 1)) -join " "
    $commandLine = "cmd.exe /d /c `"set `"PYTHONPATH=$serverSrc`" && $pythonCommand -m dofus_ocr.server --static-dir `"$distDir`" --port $Port > `"$logFile`" 2> `"$errFile`"`""
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine; CurrentDirectory = $repoRoot; ProcessStartupInformation = $startup }
    if ($created.ReturnValue -ne 0) { throw "Could not start the server (Win32_Process.Create returned $($created.ReturnValue))." }
    $process = Get-Process -Id $created.ProcessId
    Set-Content -Path $pidFile -Value $process.Id
    Set-Content -Path $portFile -Value $Port

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited) { throw "Server exited early. See $errFile" }
        $health = Get-Health $Port
        if ($health -and $health.ok) {
            $owner = Get-PortOwner $Port
            if (-not (Test-DescendsFrom $owner $process.Id)) {
                Stop-Process -Id $process.Id -Force
                throw "Port $Port answered, but its owner pid $owner was not started by this launch."
            }
            Set-Content -Path $pidFile -Value $owner
            Set-Content -Path $launcherFile -Value $process.Id
            Write-Output "READY http://127.0.0.1:$Port/ pid=$owner"
            return
        }
        Start-Sleep -Milliseconds 300
    }
    throw "Server did not answer /api/health within 30 s. See $errFile"
}

function Invoke-Stop {
    if (-not (Test-Path $pidFile)) {
        Write-Output "Nothing to stop."
        return
    }
    $serverPid = [int](Get-Content $pidFile)
    if (Test-Path $launcherFile) {
        $launcherPid = [int](Get-Content $launcherFile)
        if (Get-Process -Id $launcherPid -ErrorAction SilentlyContinue) { taskkill /T /F /PID $launcherPid | Out-Null }
    }
    try { Stop-Process -Id $serverPid -Force -ErrorAction Stop } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {}
    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Process -Id $serverPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    Remove-Item $runDir -Recurse -Force
    Write-Output "Stopped pid $serverPid. Evidence kept in .verify\evidence."
}

switch ($Command) {
    "launch" { Invoke-Launch }
    "doctor" { Invoke-Doctor }
    "stop" { Invoke-Stop }
}
