#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/.local/share/locket"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"

mkdir -p "$APP_DIR" "$DESKTOP_DIR" "$ICON_DIR"

cd "$ROOT"
if [[ ! -f dist/index.html ]]; then
  echo "Building UI…"
  npm run build
fi

cat > "$APP_DIR/run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$ROOT"
export LOCKET_DEV=0
export PATH="\$HOME/.nvm/versions/node/v22.23.1/bin:\$HOME/.local/bin:/usr/local/bin:/usr/bin:\$PATH"

# UI must be built — otherwise blank "Cannot GET /"
if [[ ! -f dist/index.html ]]; then
  npm run build
fi

# do not leave old API running without static assets
fuser -k 3847/tcp >/dev/null 2>&1 || true
sleep 0.3

exec npx electron . --no-sandbox
EOF
chmod +x "$APP_DIR/run.sh"

cp "$ROOT/build/icon.png" "$ICON_DIR/locket.png"
cp "$ROOT/build/icon.png" "$APP_DIR/icon.png"

cat > "$DESKTOP_DIR/locket.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Locket
Comment=Password, mail, SSH, and 2FA vault
Exec=$APP_DIR/run.sh
Icon=locket
Path=$ROOT
Terminal=false
Categories=Utility;Security;
StartupWMClass=Locket
EOF

# Project-local + Desktop shortcuts
cat > "$ROOT/locket.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Locket
GenericName=Password Manager
Comment=Password, mail, SSH, and 2FA vault
Exec=$APP_DIR/run.sh
Icon=$ROOT/build/icon.png
Path=$ROOT
Terminal=false
Categories=Utility;Security;
StartupNotify=true
StartupWMClass=Locket
EOF

if [[ -d "$HOME/Desktop" ]]; then
  cp "$DESKTOP_DIR/locket.desktop" "$HOME/Desktop/locket.desktop"
  chmod +x "$HOME/Desktop/locket.desktop" || true
fi

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Installed: Locket → $ROOT"
echo "Launch from the menu or: $APP_DIR/run.sh"
