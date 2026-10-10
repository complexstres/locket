import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const TOKEN_PATH = join(DATA_DIR, 'ext.token')

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
}

export function getExtToken(): string | null {
  if (!existsSync(TOKEN_PATH)) return null
  try {
    const t = readFileSync(TOKEN_PATH, 'utf8').trim()
    return t.length >= 32 ? t : null
  } catch {
    return null
  }
}

export function enableExtToken(): string {
  ensureDir()
  const existing = getExtToken()
  if (existing) return existing
  const token = randomBytes(32).toString('hex')
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 })
  return token
}

export function rotateExtToken(): string {
  ensureDir()
  const token = randomBytes(32).toString('hex')
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 })
  return token
}

export function disableExtToken() {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, '', { mode: 0o600 })
}

export function isValidExtToken(token: string): boolean {
  const saved = getExtToken()
  return Boolean(saved && token && saved === token)
}
