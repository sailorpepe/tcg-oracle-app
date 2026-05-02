#!/bin/bash
source $HOME/.cargo/env

export DEBIAN_FRONTEND=noninteractive
echo "========================================"
echo "TCG Oracle — Linux Build (Docker)"
echo "========================================"

cd /workspace

# 1. Install Node dependencies
echo "[1/3] Installing npm packages..."
npm install

# 2. Export static web build
echo "[2/3] Exporting static web build..."
npx expo export --platform web

# 3. Build Tauri (DEB + AppImage)
echo "[3/3] Building Tauri Linux packages..."
npx tauri build

echo "========================================"
echo "SUCCESS! Linux artifacts:"
ls -lh /workspace/src-tauri/target/release/bundle/deb/*.deb 2>/dev/null
ls -lh /workspace/src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null
echo "========================================"
