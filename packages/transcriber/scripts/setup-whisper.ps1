# Sets up offline transcription: whisper.cpp's HTTP server -> packages\transcriber\bin\Release\whisper-server.exe, ggml-tiny.bin -> models\.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File packages\transcriber\scripts\setup-whisper.ps1
# Compiles from source when CMake + a C++ toolchain are present; otherwise downloads the official prebuilt binaries of the same tag.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is ~10x slower with the progress bar
$Pkg    = Split-Path $PSScriptRoot -Parent
$Src    = Join-Path $Pkg 'whisper.cpp'
$Bin    = Join-Path $Pkg 'bin\Release'
$Models = Join-Path $Pkg 'models'
$Model  = Join-Path $Models 'ggml-tiny.bin'
$Tag    = 'v1.7.6'  # newest release that ships Windows binaries; the source build uses the same tag

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
New-Item -ItemType Directory -Force $Bin, $Models | Out-Null

Step "Fetching whisper.cpp $Tag"
if (Test-Path $Src) { Write-Host "    already at $Src" }
else {
    git clone --depth 1 --branch $Tag https://github.com/ggerganov/whisper.cpp $Src
    if ($LASTEXITCODE) { throw 'git clone failed' }
}

Step 'Detecting GPU'
$gpu = Has 'nvidia-smi'
Write-Host ('    ' + $(if ($gpu) { 'NVIDIA GPU found -> CUDA build' } else { 'No NVIDIA GPU -> CPU build' }))

Step 'Building whisper.cpp'
if (Has 'cmake') {
    $flags = @('-DBUILD_SHARED_LIBS=OFF', '-DWHISPER_BUILD_TESTS=OFF')
    if ($gpu -and (Has 'nvcc')) { $flags += '-DGGML_CUDA=1' }
    elseif ($gpu) { Write-Host '    nvcc not found (install the CUDA Toolkit for a GPU build) -> CPU build' -ForegroundColor Yellow }
    cmake -S $Src -B "$Src\build" @flags
    if ($LASTEXITCODE) { throw 'cmake configure failed (needs Visual Studio Build Tools with the C++ workload)' }
    cmake --build "$Src\build" --config Release -j --target whisper-server
    if ($LASTEXITCODE) { throw 'cmake build failed' }
    $out = "$Src\build"
} else {
    Write-Host '    cmake not found -> using prebuilt release binaries' -ForegroundColor Yellow
    $zipName = if ($gpu) { 'whisper-cublas-12.4.0-bin-x64.zip' } else { 'whisper-bin-x64.zip' }
    $zip = Join-Path $Src $zipName
    $out = Join-Path $Src 'prebuilt'
    Invoke-WebRequest "https://github.com/ggml-org/whisper.cpp/releases/download/$Tag/$zipName" -OutFile $zip
    Expand-Archive $zip $out -Force
}
$server = Get-ChildItem $out -Recurse -Filter 'whisper-server.exe' | Select-Object -First 1
if (-not $server) { throw "whisper-server.exe not found under $out" }
Copy-Item $server.FullName (Join-Path $Bin 'whisper-server.exe') -Force
Get-ChildItem $server.DirectoryName -Filter '*.dll' | Copy-Item -Destination $Bin -Force
Write-Host "    -> $Bin\whisper-server.exe"

Step 'Downloading ggml-tiny.bin'
if (Test-Path $Model) { Write-Host '    already present' }
else {
    Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' -OutFile "$Model.part"
    Move-Item "$Model.part" $Model
}

Write-Host "`nwhisper.cpp ready." -ForegroundColor Green
