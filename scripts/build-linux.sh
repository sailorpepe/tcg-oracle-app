#!/bin/bash
# TCG Oracle v1.1.0 — Linux Build via Docker
# Produces .deb and .rpm installers
set -e

echo ">>> TCG Oracle Linux Build (Docker)"
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  --platform linux/amd64 \
  ubuntu:22.04 \
  bash -c '
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl build-essential pkg-config libssl-dev \
      libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev \
      libayatana-appindicator3-dev rpm file > /dev/null 2>&1
    curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --quiet
    source "$HOME/.cargo/env"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    npm install --legacy-peer-deps 2>/dev/null
    npx expo export --platform web
    npx @tauri-apps/cli build --bundles deb,rpm
    echo "=== OUTPUT ==="
    find src-tauri/target/release/bundle -name "*.deb" -o -name "*.rpm" 2>/dev/null
  '
echo "Done. Check src-tauri/target/release/bundle/"
