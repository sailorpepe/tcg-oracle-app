#!/bin/bash
# ─── TCG Oracle Linux Build Script ───
# Runs inside Docker container to produce .deb and .rpm packages
set -e

echo "═══════════════════════════════════════════"
echo "  TCG Oracle — Linux Package Builder"
echo "═══════════════════════════════════════════"

cd /app

# 1. Install JS dependencies
echo "▸ Installing npm dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

# 2. Export the web frontend (Expo)
echo "▸ Exporting web frontend..."
EXPO_NO_TELEMETRY=1 CI=1 npx expo export --platform web --clear 2>&1 | tail -5

# 3. Verify dist exists
if [ ! -d "dist" ]; then
  echo "✗ ERROR: dist/ folder not found after export"
  exit 1
fi
echo "▸ Frontend exported: $(ls dist/ | wc -l) files"

# 4. Build Tauri (Linux targets only — skip macOS signing, skip dmg/nsis)
echo "▸ Building Tauri for Linux (deb + rpm)..."
cd src-tauri

# Override targets for Linux only
TAURI_CONF_OVERRIDE='{"bundle":{"targets":["deb","rpm"]}}'

cd ..
npx tauri build --config "$TAURI_CONF_OVERRIDE" 2>&1

echo ""
echo "═══════════════════════════════════════════"
echo "  BUILD COMPLETE"
echo "═══════════════════════════════════════════"

# 5. List output artifacts
echo ""
echo "▸ DEB packages:"
find src-tauri/target/release/bundle/deb -name "*.deb" 2>/dev/null || echo "  (none found)"
echo ""
echo "▸ RPM packages:"
find src-tauri/target/release/bundle/rpm -name "*.rpm" 2>/dev/null || echo "  (none found)"
echo ""

# 6. Copy to /output for easy extraction
mkdir -p /output
cp src-tauri/target/release/bundle/deb/*.deb /output/ 2>/dev/null || true
cp src-tauri/target/release/bundle/rpm/*.rpm /output/ 2>/dev/null || true

echo "▸ Packages copied to /output:"
ls -lh /output/ 2>/dev/null || echo "  (empty)"
