# Revelio installer for Windows (skeleton — Phase 1).
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
$ErrorActionPreference = 'Stop'
$Root    = Split-Path $PSScriptRoot -Parent

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

# 2-4. whisper.cpp (source/prebuilt, CUDA if NVIDIA GPU) + ggml-tiny.bin
& (Join-Path $Root 'packages\transcriber\scripts\setup-whisper.ps1')

# naudiodon (mic/system audio capture) is a native addon compiled by node-gyp during `npm install`. It needs:
#   - Visual Studio Build Tools with the "Desktop development with C++" workload
#       winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
#   - Python 3 on PATH
# It is an optional dependency: if the build fails, npm skips it and Revelio captures audio with SoX instead
#   winget install ChrisBagwell.SoX   (then make sure sox.exe is on PATH)
Step 'Checking native audio build prerequisites'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host '    Python not found - naudiodon will not build; SoX fallback will be used' -ForegroundColor Yellow }

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
