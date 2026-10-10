# Browser autofill extension

Locket ships a Manifest V3 Chromium extension that fills login forms from your local vault.

## Install (unpacked)

1. Start Locket (desktop or `npm run server` so the API is on `127.0.0.1:3847`).
2. Open `chrome://extensions` or `brave://extensions`.
3. Enable **Developer mode**.
4. **Load unpacked** → select the project’s `extension/` folder  
   (the folder that contains `manifest.json`).
5. In Locket → **Vault** → **Enable autofill** (token is copied).
6. Extension → **Options** → paste the token → save.

Helper script:

```bash
npm run install:extension
```

## Usage

- On login pages, click the floating **Locket** button, or  
- Open the extension popup → pick an account for the current host.

## API

The extension calls only localhost:

- `GET /api/ext/match?host=`
- `GET /api/ext/search?q=`
- `GET /api/ext/entry/:id`

Auth header: `X-Locket-Ext: <token>`

Rotate or disable the token anytime from the Vault browser bar.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save the extension token |
| `activeTab` / `scripting` | Fill the focused tab |
| `host_permissions` for `127.0.0.1:3847` | Talk to Locket API |
| `<all_urls>` content script | Detect password fields |

No remote servers. No analytics.
