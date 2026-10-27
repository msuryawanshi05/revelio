#!/usr/bin/env bash
# Revelio installer for macOS (skeleton — Phase 1).
# Run from the repo root:  bash scripts/install.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER="$ROOT/vendor/whisper.cpp"
MODELS="$ROOT/models"

step() { printf '\n\033[32m==> %s\033[0m\n' "$1"; }
stub() { printf '    \033[33m[stub]\033[0m %s\n' "$1"; }

# 1. Node.js 22+ and npm
step 'Checking Node.js 22+'
major=$(node -v 2>/dev/null | sed 's/^v//; s/\..*//' || echo 0)
if [ "${major:-0}" -lt 22 ]; then
  command -v brew >/dev/null || { echo 'Node.js 22+ required and Homebrew missing. Install Node from https://nodejs.org and re-run.'; exit 1; }
  brew install node@22 && brew link --overwrite --force node@22
fi
echo "    node $(node -v), npm $(npm -v)"

# 2. whisper.cpp source
step 'Fetching whisper.cpp'
stub "git clone --depth 1 https://github.com/ggerganov/whisper.cpp \"$WHISPER\""

# 3. Build (Metal is on by default on Apple Silicon)
step 'Building whisper.cpp'
stub "xcode-select --install  # clang toolchain, if missing"
stub "cmake -S \"$WHISPER\" -B \"$WHISPER/build\" && cmake --build \"$WHISPER/build\" --config Release -j"

# 4. Model weights
step 'Downloading ggml-tiny.bin'
stub "curl -L -o \"$MODELS/ggml-tiny.bin\" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"

# 5. npm dependencies
step 'Installing npm dependencies'
(cd "$ROOT" && npm install)

# 6-8. App build, shortcut, first launch
step 'Building the desktop app'
stub 'npm run build (Next.js static export + electron-builder) — Phase 2'
step 'Adding to Applications'
stub 'Copy Revelio.app to /Applications — after the build exists'
step 'First-launch setup'
stub 'In-app wizard: API keys, Google Drive sign-in, microphone + screen-recording permission — Phase 2'

printf '\nDone. Start the dev build with:  npm run dev\n'
