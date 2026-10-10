import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const SESSION_PATH = join(DATA_DIR, 'session.json')

export type PersistedSession = {
  token: string
  keyBase64: string
  lastActive: number
}

export function saveSession(session: { token: string; key: Buffer; lastActive: number }) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  const payload: PersistedSession = {
    token: session.token,
    keyBase64: session.key.toString('base64'),
    lastActive: session.lastActive,
  }
  writeFileSync(SESSION_PATH, JSON.stringify(payload), { mode: 0o600 })
}

export function loadSession(ttlMs: number): { token: string; key: Buffer; lastActive: number } | null {
  if (!existsSync(SESSION_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(SESSION_PATH, 'utf8')) as PersistedSession
    if (!raw.token || !raw.keyBase64 || !raw.lastActive) return null
    if (Date.now() - raw.lastActive > ttlMs) {
      clearSession()
      return null
    }
    return {
      token: raw.token,
      key: Buffer.from(raw.keyBase64, 'base64'),
      lastActive: raw.lastActive,
    }
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    if (existsSync(SESSION_PATH)) unlinkSync(SESSION_PATH)
  } catch {
    /* ignore */
  }
}
