import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12
const SALT_LEN = 16
const VERIFIER = 'locket-v1'

export function hashMaster(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: 16384, r: 8, p: 1 })
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return hashMaster(password, salt)
}

export function makeVerifier(key: Buffer): string {
  return createHash('sha256').update(Buffer.concat([key, Buffer.from(VERIFIER)])).digest('hex')
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + 16)
  const data = buf.subarray(IV_LEN + 16)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function newSalt(): Buffer {
  return randomBytes(SALT_LEN)
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex')
}
