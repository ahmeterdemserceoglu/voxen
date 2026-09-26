#!/bin/sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$ROOT_DIR/.." && pwd)
PKG_DIR="$ROOT_DIR/build/deb-root"
OUT_DIR="$ROOT_DIR/release"

cd "$PROJECT_DIR"
EXPO_PUBLIC_VOXEN_DESKTOP=1 npx expo export --platform web --output-dir dist-linux --clear

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN" "$PKG_DIR/opt/voxen-player/runtime" "$PKG_DIR/usr/bin" "$PKG_DIR/usr/share/applications" "$PKG_DIR/usr/share/icons/hicolor/512x512/apps" "$OUT_DIR"
cp "$ROOT_DIR/server.js" "$PKG_DIR/opt/voxen-player/"
cp -R "$PROJECT_DIR/dist-linux" "$PKG_DIR/opt/voxen-player/dist"
cp -R "$ROOT_DIR/node_modules" "$PKG_DIR/opt/voxen-player/node_modules"
cp "$(command -v node)" "$PKG_DIR/opt/voxen-player/runtime/node"
cp "$ROOT_DIR/voxen-player" "$PKG_DIR/usr/bin/voxen-player"
cp "$ROOT_DIR/voxen-player-dev" "$PKG_DIR/usr/bin/voxen-player-dev"
cp "$ROOT_DIR/voxen-player.desktop" "$PKG_DIR/usr/share/applications/"
cp "$PROJECT_DIR/assets/icon.png" "$PKG_DIR/usr/share/icons/hicolor/512x512/apps/voxen-player.png"
chmod 755 "$PKG_DIR/usr/bin/voxen-player" "$PKG_DIR/usr/bin/voxen-player-dev" "$PKG_DIR/opt/voxen-player/runtime/node"

cat > "$PKG_DIR/DEBIAN/control" <<'EOF'
Package: voxen-player
Version: 1.0.3
Section: sound
Priority: optional
Architecture: amd64
Depends: libc6, libstdc++6, google-chrome-stable | chromium | chromium-browser
Maintainer: Laze Studio
Description: Voxen YouTube Music masaustu oynaticisi
 Mobil Voxen tasarimini ve ozelliklerini Linux'a tasiyan yerel masaustu
 uygulamasi. InnerTube katalogu ve reklamsiz ses cozumlemesi yerelde calisir.
EOF

dpkg-deb --build --root-owner-group "$PKG_DIR" "$OUT_DIR/voxen-player_1.0.3_amd64.deb"
