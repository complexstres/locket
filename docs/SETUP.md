# Setup

## Prerequisites

- **Node.js 20+** (22.x recommended; Sharp needs modern Node)
- npm 10+
- Linux recommended for Electron desktop + global hotkeys

If you use nvm:

```bash
nvm install 22
nvm use 22
```

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| UI (Vite) | http://localhost:5173 |
| API | http://127.0.0.1:3847 |

Desktop with hot-reload UI:

```bash
npm run dev:desktop
```

## Production desktop

```bash
npm run build
npm run desktop
# or shortcut:
npm run install:desktop
~/.local/share/locket/run.sh
```

Packaged AppImage:

```bash
npm run pack:linux
# → release/
```

## Data directory

Encrypted vault and local secrets are stored under `data/` (never commit this folder):

| File | Purpose |
| --- | --- |
| `vault.enc` | Encrypted vault |
| `vault.enc.bak` | Atomic backup |
| `device.key` | Device unlock key |
| `session.json` | Short-lived session |
| `ext.token` | Browser extension token |

## Troubleshooting

**Black window / “Cannot GET /”**  
Run `npm run build` so `dist/index.html` exists, then restart desktop.

**Sharp / Electron binary errors**  
Use system Node 20+ in `PATH` (nvm Node 22). The launcher prefers `~/.nvm/versions/node/v22.*/bin`.

**Port 3847 busy**  
Stop the other process or set `LOCKET_PORT`.

**Hotkey does nothing**  
Ensure the Electron app is running (tray icon). Try `Ctrl+Alt+L` if `Ctrl+Shift+Space` is taken by the DE.
