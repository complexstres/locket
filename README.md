<p align="center">
  <img src="public/brand-mark.svg" width="88" height="88" alt="Locket" />
</p>

<h1 align="center">Locket</h1>

<p align="center">
  <strong>Local password vault</strong> with mail, 2FA, SSH keys, browser autofill,<br/>
  and a global quick-picker — built for Linux desktops.
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/SETUP.md">Setup</a> ·
  <a href="docs/EXTENSION.md">Extension</a> ·
  <a href="docs/SECURITY.md">Security</a>
</p>

---

Locket keeps your secrets on **your machine**. AES-encrypted vault, no cloud account, no telemetry. Open the desktop app, fill forms from the browser extension, or hit a global hotkey to copy a password in two keystrokes.

## Features

| Area | What you get |
| --- | --- |
| **Vault** | Passwords, categories, brand icons, site hubs (login + 2FA + mail) |
| **Mail** | IMAP inboxes (Gmail / Yandex / Mail.ru app passwords) |
| **2FA** | TOTP codes, QR import, Google Authenticator migration |
| **SSH** | Generate and store key pairs |
| **Security** | Breach checks, reused / weak / stale password insights |
| **Browser** | Chrome/Brave MV3 autofill extension |
| **Desktop** | Electron app + tray + `Ctrl+Shift+Space` quick picker |

## Quick start

**Requirements:** Node.js **20+** (22 recommended), Linux for the desktop build.

```bash
git clone <your-repo-url> locket
cd locket
npm install
npm run dev          # API :3847 + Vite :5173
```

Open http://localhost:5173

### Desktop (Linux)

```bash
npm run desktop              # build UI + open Electron
npm run install:desktop      # menu / desktop shortcut
```

Hotkeys while the app is running:

- `Ctrl+Shift+Space` — quick search / copy
- `Ctrl+Alt+L` — same picker (fallback)

### Browser autofill

```bash
npm run install:extension    # prints load instructions
```

1. Chrome/Brave → `chrome://extensions` → Developer mode  
2. **Load unpacked** → select the `extension/` folder  
3. In Locket → Vault → **Enable autofill** → paste token into extension options  

Full guide: [docs/EXTENSION.md](docs/EXTENSION.md)

### Tests

```bash
# API must be running (npm run server or desktop)
npm run test:ext
```

## Project layout

```
locket/
├── src/            React UI (vault, mail, 2FA, …)
├── server/         Local Express API + encrypted store
├── electron/       Desktop shell, tray, global hotkeys
├── extension/      Chromium MV3 autofill
├── docs/           Setup, extension, security notes
├── scripts/        Installers + e2e smoke tests
└── public/         Brand assets
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API + Vite |
| `npm run desktop` | Production UI + Electron |
| `npm run pack:linux` | AppImage / dir under `release/` |
| `npm run install:desktop` | Install launcher shortcut |
| `npm run install:extension` | Print extension load steps |
| `npm run test:ext` | Extension / hub / picker smoke tests |
| `npm run build` | Typecheck + Vite production build |

## Privacy

- Vault files live in `data/` (gitignored): `vault.enc`, keys, session  
- API binds to `127.0.0.1` only  
- Extension talks to localhost with a rotatable token  

See [docs/SECURITY.md](docs/SECURITY.md).

## License

[MIT](LICENSE)
