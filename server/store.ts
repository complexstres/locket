import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decrypt, deriveKey, encrypt, makeVerifier, newSalt, safeEqualHex } from './crypto.js'
import { emptyVault, normalizeVault, type MetaFile, type VaultData } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const META_PATH = join(DATA_DIR, 'meta.json')
const VAULT_PATH = join(DATA_DIR, 'vault.enc')
const VAULT_BAK_PATH = join(DATA_DIR, 'vault.enc.bak')
const DEVICE_KEY_PATH = join(DATA_DIR, 'device.key')

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
}

/** Atomic write — temp file then rename (survives crash/power loss mid-write). */
function atomicWrite(path: string, data: string | Buffer, mode = 0o600) {
  ensureDir()
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, data, { mode })
  renameSync(tmp, path)
}

export function isInitialized(): boolean {
  return existsSync(META_PATH) && existsSync(VAULT_PATH)
}

export function saveDeviceKey(key: Buffer) {
  atomicWrite(DEVICE_KEY_PATH, key, 0o600)
}

export function loadDeviceKey(): Buffer | null {
  if (!existsSync(DEVICE_KEY_PATH)) return null
  try {
    const key = readFileSync(DEVICE_KEY_PATH)
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

function initializeWithKey(key: Buffer): void {
  ensureDir()
  const salt = newSalt()
  const empty: VaultData = emptyVault()
  const meta: MetaFile & { mode?: string } = {
    salt: salt.toString('base64'),
    verifier: makeVerifier(key),
    createdAt: new Date().toISOString(),
    mode: 'device',
  }
  atomicWrite(META_PATH, JSON.stringify(meta, null, 2), 0o600)
  atomicWrite(VAULT_PATH, encrypt(JSON.stringify(empty), key), 0o600)
  saveDeviceKey(key)
}

export function unlockWithKey(key: Buffer): void {
  if (!isInitialized()) throw new Error('Vault not initialized')
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8')) as MetaFile
  if (!safeEqualHex(makeVerifier(key), meta.verifier)) {
    // try decrypt anyway for device keys stored post-password-unlock
    try {
      decrypt(readFileSync(VAULT_PATH, 'utf8'), key)
      return
    } catch {
      throw new Error('Device key mismatch')
    }
  }
  decrypt(readFileSync(VAULT_PATH, 'utf8'), key)
}

/** Open vault without user password — device key on disk */
export function ensureAutoVault(): { key: Buffer } {
  ensureDir()

  if (!isInitialized()) {
    const key = randomBytes(32)
    initializeWithKey(key)
    return { key }
  }

  const device = loadDeviceKey()
  if (device) {
    try {
      unlockWithKey(device)
      return { key: device }
    } catch {
      /* fall through */
    }
  }

  throw new Error('NEEDS_MIGRATE')
}

export function initializeVault(masterPassword: string): { key: Buffer } {
  ensureDir()
  if (isInitialized()) throw new Error('Vault already exists')

  const salt = newSalt()
  const key = deriveKey(masterPassword, salt)
  const empty: VaultData = emptyVault()
  const meta: MetaFile = {
    salt: salt.toString('base64'),
    verifier: makeVerifier(key),
    createdAt: new Date().toISOString(),
  }

  atomicWrite(META_PATH, JSON.stringify(meta, null, 2), 0o600)
  atomicWrite(VAULT_PATH, encrypt(JSON.stringify(empty), key), 0o600)
  saveDeviceKey(key)
  return { key }
}

export function unlockVault(masterPassword: string): { key: Buffer } {
  if (!isInitialized()) throw new Error('Vault not initialized')
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8')) as MetaFile
  const salt = Buffer.from(meta.salt, 'base64')
  const key = deriveKey(masterPassword, salt)
  if (!safeEqualHex(makeVerifier(key), meta.verifier)) {
    throw new Error('Wrong master password')
  }
  decrypt(readFileSync(VAULT_PATH, 'utf8'), key)
  saveDeviceKey(key)
  return { key }
}

export function readVault(key: Buffer): VaultData {
  try {
    const raw = decrypt(readFileSync(VAULT_PATH, 'utf8'), key)
    return normalizeVault(JSON.parse(raw) as Partial<VaultData>)
  } catch (err) {
    // recover from last good backup if primary is corrupted
    if (existsSync(VAULT_BAK_PATH)) {
      const raw = decrypt(readFileSync(VAULT_BAK_PATH, 'utf8'), key)
      return normalizeVault(JSON.parse(raw) as Partial<VaultData>)
    }
    throw err
  }
}

export function writeVault(key: Buffer, data: VaultData): void {
  ensureDir()
  const payload = encrypt(JSON.stringify(data), key)
  if (existsSync(VAULT_PATH)) {
    try {
      copyFileSync(VAULT_PATH, VAULT_BAK_PATH)
    } catch {
      /* ignore backup errors */
    }
  }
  atomicWrite(VAULT_PATH, payload, 0o600)
}
