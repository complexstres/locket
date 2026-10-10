#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/extension"
echo "Locket Autofill extension:"
echo "  1. Open chrome://extensions (or brave://extensions)"
echo "  2. Enable Developer mode"
echo "  3. Load unpacked → select:"
echo "     $EXT"
echo "  4. In Locket: Vault → Enable autofill → copy the token"
echo "  5. In the extension: Settings → paste the token"
echo
echo "Quick-search hotkey (when the desktop app is running):"
echo "  Ctrl+Shift+Space  or  Ctrl+Alt+L"
