import { createHmac } from 'node:crypto'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function normalizeSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase()
}

export function base32Decode(secret: string): Buffer {
  const cleaned = normalizeSecret(secret)
  let bits = ''
  for (const c of cleaned) {
    const val = BASE32.indexOf(c)
    if (val < 0) throw new Error('Invalid Base32 secret')
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

export function generateTotp(
  secret: string,
  opts: { digits?: number; period?: number; algorithm?: 'SHA1' | 'SHA256' | 'SHA512'; time?: number } = {},
): { code: string; remaining: number; period: number } {
  const digits = opts.digits || 6
  const period = opts.period || 30
  const algorithm = opts.algorithm || 'SHA1'
  const time = opts.time ?? Date.now()
  const counter = Math.floor(time / 1000 / period)
  const remaining = period - (Math.floor(time / 1000) % period)

  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))

  const algo = algorithm === 'SHA256' ? 'sha256' : algorithm === 'SHA512' ? 'sha512' : 'sha1'
  const hmac = createHmac(algo, key).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  const code = (bin % 10 ** digits).toString().padStart(digits, '0')
  return { code, remaining, period }
}

export function parseOtpAuthUri(uri: string): {
  label: string
  issuer: string
  secret: string
  digits: number
  period: number
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
} {
  const url = new URL(uri)
  if (url.protocol !== 'otpauth:') throw new Error('Expected otpauth:// URI')
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const secret = url.searchParams.get('secret')
  if (!secret) throw new Error('Missing secret in URI')
  const issuer = url.searchParams.get('issuer') || label.split(':')[0] || ''
  const algo = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase()
  return {
    label: label.includes(':') ? label.split(':').slice(1).join(':') : label,
    issuer,
    secret: normalizeSecret(secret),
    digits: Number(url.searchParams.get('digits') || 6),
    period: Number(url.searchParams.get('period') || 30),
    algorithm: (algo === 'SHA256' || algo === 'SHA512' ? algo : 'SHA1') as 'SHA1' | 'SHA256' | 'SHA512',
  }
}
