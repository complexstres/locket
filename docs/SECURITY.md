# Security model

Locket is designed as a **local-only** vault.

## Threat model (short)

| Protects against | Does not protect against |
| --- | --- |
| Cloud leaks / vendor breaches | Malware with your user privileges |
| Network sniffing of vault contents | Physical access while unlocked |
| Casual shoulder-surfing of stored files | Compromised browser extensions |

## Cryptography

- Vault encrypted at rest (`data/vault.enc`)
- Device-bound unlock for passwordless day-to-day use
- Legacy master-password vaults can be migrated once

Exact algorithms live in `server/crypto.ts` / `server/store.ts` — review those if you need formal details.

## Network

- HTTP API listens on **127.0.0.1** only
- Browser extension uses a long random token (`data/ext.token`)
- Token can be rotated or disabled from the UI

## Clipboard

Sensitive copies use short-lived clipboard clears where supported (`src/clipboardSecure.ts`).

## What not to commit

Never publish:

- `data/`
- `*.enc`, `device.key`, `ext.token`, `session.json`
- `.env` files

`.gitignore` already excludes these.

## Reporting issues

If you find a vulnerability, open a private security advisory on GitHub (or contact the maintainer) instead of a public issue when possible.
