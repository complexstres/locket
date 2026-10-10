import { BrowserQRCodeReader } from '@zxing/browser'
import jsQR from 'jsqr'

const OTPAUTH_RE = /otpauth:\/\/[^\s"'<>\\]+/i
const SECRET_RE = /(?:secret|setup\s*key)\s*[:=]?\s*([A-Z2-7\s]{16,})/i

const MIGRATION_RE = /otpauth-migration:\/\/[^\s"'<>\\]+/i

export function normalizeTotpPayload(raw: string): string {
  const text = raw.replace(/\u0000/g, '').trim()
  if (!text) throw new Error('Empty input')

  const migration = text.match(MIGRATION_RE)?.[0]
  if (migration) return migration.replace(/[),.;\]}'"`]+$/g, '')

  const otp = text.match(OTPAUTH_RE)?.[0]
  if (otp) return otp.replace(/[),.;\]}'"`]+$/g, '')

  if (/otpauth-migration/i.test(text)) {
    throw new Error('This is a Google Authenticator export — upload every QR (1 of N)')
  }

  const labeled = text.match(SECRET_RE)?.[1]
  const compact = text.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const secret = (labeled || '').toUpperCase().replace(/[^A-Z2-7]/g, '') || compact
  if (secret.length >= 16) {
    return `otpauth://totp/Imported?secret=${secret}&issuer=Locket`
  }

  try {
    const decoded = decodeURIComponent(text)
    const nestedMig = decoded.match(MIGRATION_RE)?.[0]
    if (nestedMig) return nestedMig.replace(/[),.;\]}'"`]+$/g, '')
    const nested = decoded.match(OTPAUTH_RE)?.[0]
    if (nested) return nested.replace(/[),.;\]}'"`]+$/g, '')
  } catch {
    /* ignore */
  }

  throw new Error('Need a QR with otpauth://, Google export, or a setup key')
}

function yieldUi() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

function drawToCanvas(
  source: CanvasImageSource,
  w: number,
  h: number,
  maxSide = 640,
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function tryJsQR(canvas: HTMLCanvasElement, invert: 'dontInvert' | 'attemptBoth' = 'dontInvert'): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const { width, height } = canvas
  if (width * height > 900_000) return null
  const image = ctx.getImageData(0, 0, width, height)
  try {
    const code = jsQR(image.data, width, height, { inversionAttempts: invert })
    return code?.data || null
  } catch {
    return null
  }
}

const zxingReader = new BrowserQRCodeReader(undefined, {
  delayBetweenScanAttempts: 0,
  delayBetweenScanSuccess: 0,
})

async function tryZxing(source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement): Promise<string | null> {
  try {
    const result = await zxingReader.decodeFromCanvas(source as HTMLCanvasElement)
    return result?.getText() || null
  } catch {
    try {
      // image / video fallbacks
      if (source instanceof HTMLImageElement) {
        const result = await zxingReader.decodeFromImageElement(source)
        return result?.getText() || null
      }
    } catch {
      /* ignore */
    }
    return null
  }
}

function cropCenter(canvas: HTMLCanvasElement, ratio = 0.62): HTMLCanvasElement {
  const side = Math.min(canvas.width, canvas.height) * ratio
  const sx = (canvas.width - side) / 2
  const sy = (canvas.height - side) / 2
  const out = document.createElement('canvas')
  out.width = Math.round(side)
  out.height = Math.round(side)
  out.getContext('2d')!.drawImage(canvas, sx, sy, side, side, 0, 0, out.width, out.height)
  return out
}

/** Fast local pass — ZXing first (better on screenshots), then jsQR. */
async function decodeLocalQuick(bitmap: ImageBitmap): Promise<string | null> {
  const base = drawToCanvas(bitmap, bitmap.width, bitmap.height, 720)
  await yieldUi()

  let hit = await tryZxing(base)
  if (hit) return hit

  await yieldUi()
  hit = tryJsQR(base, 'dontInvert')
  if (hit) return hit

  await yieldUi()
  const cropped = cropCenter(base, 0.65)
  hit = (await tryZxing(cropped)) || tryJsQR(cropped, 'dontInvert')
  if (hit) return hit

  await yieldUi()
  return tryJsQR(base, 'attemptBoth')
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function ensureToken(): Promise<string> {
  let token = localStorage.getItem('locket_token') || ''
  if (token) return token
  try {
    const res = await fetch('/api/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = (await res.json()) as { token?: string }
    if (data.token) {
      localStorage.setItem('locket_token', data.token)
      return data.token
    }
  } catch {
    /* ignore */
  }
  return token
}

async function decodeOnServer(file: File): Promise<string | null> {
  const b64 = await fileToBase64(file)
  const token = await ensureToken()
  const res = await fetch('/api/totp/qr-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image: b64 }),
  })
  if (res.status === 401) {
    localStorage.removeItem('locket_token')
    const again = await ensureToken()
    const retry = await fetch('/api/totp/qr-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${again}`,
      },
      body: JSON.stringify({ image: b64 }),
    })
    const data = (await retry.json().catch(() => ({}))) as { uri?: string }
    return data.uri || null
  }
  const data = (await res.json().catch(() => ({}))) as { uri?: string }
  if (!res.ok) return null
  return data.uri || null
}

export async function decodeQrFromFile(file: File): Promise<string> {
  if (file.type.startsWith('text/')) {
    return normalizeTotpPayload(await file.text())
  }

  // Large screenshots → server first (sharp tiles, no UI freeze)
  if (file.size > 180_000) {
    const remote = await decodeOnServer(file)
    if (remote) return normalizeTotpPayload(remote)
  }

  const bitmap = await createImageBitmap(file)
  try {
    const local = await decodeLocalQuick(bitmap)
    if (local) return normalizeTotpPayload(local)
  } finally {
    bitmap.close()
  }

  const remote = await decodeOnServer(file)
  if (remote) return normalizeTotpPayload(remote)

  throw new Error(
    'QR not found. Upload a large screenshot of the QR or paste the setup key as text.',
  )
}

export async function decodeQrFromVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  if (video.readyState < 2 || !video.videoWidth) return null
  const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight, 420)
  const hit =
    (await tryZxing(canvas)) ||
    tryJsQR(canvas, 'dontInvert') ||
    tryJsQR(cropCenter(canvas, 0.7), 'dontInvert')
  if (!hit) return null
  try {
    return normalizeTotpPayload(hit)
  } catch {
    return null
  }
}
