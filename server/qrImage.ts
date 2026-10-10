import jsQR from 'jsqr'
import sharp from 'sharp'

function normalize(raw: string): string | null {
  const text = raw.trim()
  const migration = text.match(/otpauth-migration:\/\/[^\s"'<>\\]+/i)?.[0]
  if (migration) return migration.replace(/[),.;\]}'"`]+$/g, '')
  const otp = text.match(/otpauth:\/\/[^\s"'<>\\]+/i)?.[0]
  if (otp) return otp.replace(/[),.;\]}'"`]+$/g, '')
  // never treat migration strings as secrets
  if (/otpauth-migration/i.test(text)) return null
  const secret = text.toUpperCase().replace(/[^A-Z2-7]/g, '')
  if (secret.length >= 16) return `otpauth://totp/Imported?secret=${secret}&issuer=Locket`
  return null
}

async function tryRgba(data: Buffer, width: number, height: number): Promise<string | null> {
  if (width < 40 || height < 40) return null
  if (data.length < width * height * 4) return null
  try {
    const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height, {
      inversionAttempts: 'attemptBoth',
    })
    return code?.data ? normalize(code.data) : null
  } catch {
    return null
  }
}

async function decodeBuffer(input: Buffer, pipeline: (img: sharp.Sharp) => sharp.Sharp): Promise<string | null> {
  const { data, info } = await pipeline(sharp(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return tryRgba(data, info.width, info.height)
}

/** Multi-pass QR decode: resize, contrast, tiles, crops — stays under ~1–2s for typical screenshots. */
export async function decodeTotpQrImage(base64: string): Promise<string> {
  const input = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  if (input.length < 100) throw new Error('Empty image')

  const meta = await sharp(input).rotate().metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (!w || !h) throw new Error('Invalid image')

  // Oriented buffer once
  const oriented = await sharp(input).rotate().toBuffer()

  // 1) Full image at a few scales (fast)
  for (const size of [480, 720, 960]) {
    const hit = await decodeBuffer(oriented, (img) =>
      img.resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }),
    )
    if (hit) return hit
  }

  // 2) High-contrast / threshold variants of full image
  {
    const hit = await decodeBuffer(oriented, (img) =>
      img
        .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
        .greyscale()
        .normalize()
        .linear(1.35, -(128 * 0.35)),
    )
    if (hit) return hit
  }
  {
    const hit = await decodeBuffer(oriented, (img) =>
      img
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .greyscale()
        .normalize()
        .threshold(140),
    )
    if (hit) return hit
  }

  // 3) Centered / left / right crops (setup pages put QR in corners)
  const boxes = [
    [0.2, 0.2, 0.6, 0.6],
    [0.25, 0.25, 0.5, 0.5],
    [0.05, 0.15, 0.45, 0.55],
    [0.08, 0.22, 0.5, 0.5],
    [0.5, 0.15, 0.45, 0.55],
    [0.1, 0.35, 0.4, 0.45],
    [0.3, 0.1, 0.4, 0.5],
  ] as const

  for (const [x, y, sw, sh] of boxes) {
    const left = Math.max(0, Math.floor(w * x))
    const top = Math.max(0, Math.floor(h * y))
    const width = Math.min(Math.floor(w * sw), w - left)
    const height = Math.min(Math.floor(h * sh), h - top)
    if (width < 60 || height < 60) continue
    for (const size of [280, 400]) {
      const hit = await decodeBuffer(oriented, (img) =>
        img.extract({ left, top, width, height }).resize(size, size, { fit: 'fill' }).greyscale().normalize(),
      )
      if (hit) return hit
    }
  }

  // 4) Tile scan + upscale for tiny QR on large screenshots
  if (Math.max(w, h) >= 600) {
    const grids = [
      [3, 3],
      [4, 4],
    ] as const
    for (const [cols, rows] of grids) {
      const overlap = 0.2
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const tw = Math.floor(w / cols)
          const th = Math.floor(h / rows)
          const ox = Math.floor(tw * overlap)
          const oy = Math.floor(th * overlap)
          const left = Math.max(0, col * tw - ox)
          const top = Math.max(0, row * th - oy)
          const width = Math.min(w - left, tw + ox * 2)
          const height = Math.min(h - top, th + oy * 2)
          if (width < 60 || height < 60) continue
          // Upscale small tiles so an ~80px QR becomes readable
          const hit = await decodeBuffer(oriented, (img) =>
            img
              .extract({ left, top, width, height })
              .resize(480, 480, { fit: 'inside', withoutEnlargement: false })
              .greyscale()
              .normalize(),
          )
          if (hit) return hit
        }
      }
    }
  }

  throw new Error('QR code not found in image')
}
