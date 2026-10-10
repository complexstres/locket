/**
 * Google Authenticator export: otpauth-migration://offline?data=<base64 protobuf>
 * Schema (MigrationPayload / OtpParameters) — wire format only, no protobuf lib.
 */

export type MigratedTotp = {
  label: string
  issuer: string
  secret: string
  digits: number
  period: number
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  type: 'totp' | 'hotp'
}

export type MigrationBatch = {
  accounts: MigratedTotp[]
  version: number
  batchSize: number
  batchIndex: number
  batchId: number
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

function readVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0
  let shift = 0
  let pos = offset
  while (pos < buf.length) {
    const b = buf[pos++]!
    result |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) break
    shift += 7
    if (shift > 35) throw new Error('Invalid protobuf')
  }
  return [result >>> 0, pos]
}

function readBytes(buf: Uint8Array, offset: number): [Uint8Array, number] {
  const [len, pos] = readVarint(buf, offset)
  const end = pos + len
  if (end > buf.length) throw new Error('Truncated protobuf')
  return [buf.subarray(pos, end), end]
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function parseOtpParameters(buf: Uint8Array): MigratedTotp | null {
  let secret = new Uint8Array(0)
  let name = ''
  let issuer = ''
  let algorithm = 1
  let digits = 1
  let type = 2

  let i = 0
  while (i < buf.length) {
    const [tag, next] = readVarint(buf, i)
    i = next
    const field = tag >>> 3
    const wire = tag & 7
    if (wire === 0) {
      const [v, n] = readVarint(buf, i)
      i = n
      if (field === 4) algorithm = v
      else if (field === 5) digits = v
      else if (field === 6) type = v
    } else if (wire === 2) {
      const [bytes, n] = readBytes(buf, i)
      i = n
      if (field === 1) secret = bytes
      else if (field === 2) name = decodeUtf8(bytes)
      else if (field === 3) issuer = decodeUtf8(bytes)
    } else if (wire === 1) {
      i += 8
    } else if (wire === 5) {
      i += 4
    } else {
      break
    }
  }

  if (!secret.length) return null
  // HOTP not supported in UI yet
  if (type === 1) return null

  const algo: MigratedTotp['algorithm'] =
    algorithm === 2 ? 'SHA256' : algorithm === 3 ? 'SHA512' : 'SHA1'
  const dig = digits === 2 ? 8 : 6

  // name often "Issuer:account" or just account
  let label = name
  let iss = issuer
  if (!iss && name.includes(':')) {
    const [a, ...rest] = name.split(':')
    iss = a || ''
    label = rest.join(':')
  } else if (iss && name.startsWith(`${iss}:`)) {
    label = name.slice(iss.length + 1)
  }

  return {
    label: label || iss || '2FA',
    issuer: iss || 'Imported',
    secret: base32Encode(secret),
    digits: dig,
    period: 30,
    algorithm: algo,
    type: 'totp',
  }
}

function parseMigrationPayload(buf: Uint8Array): MigrationBatch {
  const accounts: MigratedTotp[] = []
  let version = 1
  let batchSize = 1
  let batchIndex = 0
  let batchId = 0

  let i = 0
  while (i < buf.length) {
    const [tag, next] = readVarint(buf, i)
    i = next
    const field = tag >>> 3
    const wire = tag & 7
    if (wire === 0) {
      const [v, n] = readVarint(buf, i)
      i = n
      if (field === 2) version = v
      else if (field === 3) batchSize = v
      else if (field === 4) batchIndex = v
      else if (field === 5) batchId = v
    } else if (wire === 2) {
      const [bytes, n] = readBytes(buf, i)
      i = n
      if (field === 1) {
        const acc = parseOtpParameters(bytes)
        if (acc) accounts.push(acc)
      }
    } else if (wire === 1) {
      i += 8
    } else if (wire === 5) {
      i += 4
    } else {
      break
    }
  }

  return { accounts, version, batchSize, batchIndex, batchId }
}

function decodeDataParam(data: string): Uint8Array {
  // URL-safe base64
  let b64 = decodeURIComponent(data).replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = Buffer.from(b64, 'base64')
  return new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
}

export function isMigrationUri(raw: string): boolean {
  return /otpauth-migration:\/\//i.test(raw)
}

export function parseMigrationUri(raw: string): MigrationBatch {
  const text = raw.trim()
  const m = text.match(/otpauth-migration:\/\/[^\s"'<>]+/i)
  const uri = m?.[0] || text
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    throw new Error('Invalid Google Authenticator export QR')
  }
  if (!url.protocol.startsWith('otpauth-migration')) {
    throw new Error('Expected otpauth-migration://')
  }
  const data = url.searchParams.get('data')
  if (!data) throw new Error('Migration QR missing data=')
  return parseMigrationPayload(decodeDataParam(data))
}

export function accountsToOtpAuth(accounts: MigratedTotp[]): string[] {
  return accounts.map((a) => {
    const label = a.issuer ? `${encodeURIComponent(a.issuer)}:${encodeURIComponent(a.label)}` : encodeURIComponent(a.label)
    const params = new URLSearchParams({
      secret: a.secret,
      issuer: a.issuer,
      digits: String(a.digits),
      period: String(a.period),
      algorithm: a.algorithm,
    })
    return `otpauth://totp/${label}?${params.toString()}`
  })
}
