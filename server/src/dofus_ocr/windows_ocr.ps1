param(
    [Parameter(Mandatory = $true)]
    [string] $ImagePath,

    [string] $OutputPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRtOperation($AsyncOperation, [Type] $ResultType) {
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq "AsTask" -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
        } |
        Select-Object -First 1

    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
    $task.Wait() | Out-Null
    $task.Result
}

$resolvedPath = (Resolve-Path -LiteralPath $ImagePath).Path

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]

$file = Await-WinRtOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPath)) ([Windows.Storage.StorageFile])
$stream = Await-WinRtOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRtOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRtOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
    throw "Windows OCR engine is not available for the current user profile language."
}

$result = Await-WinRtOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$payload = [ordered] @{
    imagePath = $resolvedPath
    text = $result.Text
    lines = @(
        foreach ($line in $result.Lines) {
            [ordered] @{
                text = $line.Text
                words = @(
                    foreach ($word in $line.Words) {
                        [ordered] @{
                            text = $word.Text
                            box = [ordered] @{
                                x = $word.BoundingRect.X
                                y = $word.BoundingRect.Y
                                width = $word.BoundingRect.Width
                                height = $word.BoundingRect.Height
                            }
                        }
                    }
                )
            }
        }
    )
}

$json = $payload | ConvertTo-Json -Depth 8 -Compress
if ($OutputPath) {
    Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
} else {
    Write-Output $json
}
