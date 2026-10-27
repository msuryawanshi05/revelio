# Revelio installer for Windows (skeleton — Phase 1).
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
$ErrorActionPreference = 'Stop'
$Root    = Split-Path $PSScriptRoot -Parent
$Vendor  = Join-Path $Root 'vendor'
$Models  = Join-Path $Root 'models'
$Whisper = Join-Path $Vendor 'whisper.cpp'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Stub($msg) { Write-Host "    [stub] $msg" -ForegroundColor Yellow }

# 1. Node.js 22+ and npm
Step 'Checking Node.js 22+'
$node = Get-Command node -ErrorAction SilentlyContinue
$major = if ($node) { [int]((node -v).TrimStart('v').Split('.')[0]) } else { 0 }
if ($major -lt 22) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ is required and winget is unavailable. Install Node from https://nodejs.org and re-run.' }
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
Write-Host "    node $(node -v), npm $(npm -v)"

# 2. whisper.cpp source
Step 'Fetching whisper.cpp'
Stub "git clone --depth 1 https://github.com/ggerganov/whisper.cpp `"$Whisper`""

# 3. GPU detection + build
Step 'Detecting GPU'
$cuda = [bool](Get-Command nvidia-smi -ErrorAction SilentlyContinue)
Write-Host ("    " + ($(if ($cuda) { 'NVIDIA GPU found -> CUDA build' } else { 'No NVIDIA GPU -> CPU build' })))
Step 'Building whisper.cpp'
$flags = if ($cuda) { '-DGGML_CUDA=1' } else { '' }
Stub "cmake -S `"$Whisper`" -B `"$Whisper\build`" $flags   # needs CMake + MSVC Build Tools (or MinGW); CUDA Toolkit for GPU"
Stub "cmake --build `"$Whisper\build`" --config Release -j"

# 4. Model weights
Step 'Downloading ggml-tiny.bin'
Stub "Invoke-WebRequest https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin -OutFile `"$Models\ggml-tiny.bin`""

# 5. npm dependencies
Step 'Installing npm dependencies'
Push-Location $Root
try { npm install } finally { Pop-Location }

# 6. Electron build
Step 'Building the desktop app'
Stub 'npm run build (Next.js static export + electron-builder) — Phase 2'

# 7. Desktop shortcut
Step 'Creating desktop shortcut'
Stub 'WScript.Shell shortcut to the built Revelio.exe — after step 6 exists'

# 8. First-launch setup
Step 'First-launch setup'
Stub 'Setup wizard (API keys, Google Drive sign-in, microphone permission) runs inside the app on first start — Phase 2'

Write-Host "`nDone. Start the dev build with:  npm run dev" -ForegroundColor Green
