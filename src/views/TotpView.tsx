import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, type TotpLive } from '../api'
import { BrandIcon } from '../BrandIcon'
import { detectBrand } from '../brands'
import { copySecure } from '../clipboardSecure'
import { decodeQrFromFile, decodeQrFromVideoFrame, normalizeTotpPayload } from '../qrDecode'

type Props = { toast: (t: string) => void }

export function TotpView({ toast }: Props) {
  const [items, setItems] = useState<TotpLive[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ label: '', issuer: '', secret: '', uri: '' })
  const [scanning, setScanning] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [q, setQ] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number>(0)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const busyRef = useRef(false)

  const refresh = async () => {
    setItems(await api.totp())
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((t) => `${t.issuer} ${t.label}`.toLowerCase().includes(needle))
  }, [items, q])

  useEffect(() => {
    refresh().catch(() => undefined)
    const id = window.setInterval(() => {
      refresh().catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const stopCamera = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamOn(false)
  }

  useEffect(() => () => stopCamera(), [])

  const importUri = async (raw: string) => {
    const uri = normalizeTotpPayload(raw)
    const result = await api.createTotp({ uri })
    await refresh()
    if (result && typeof result === 'object' && 'imported' in result) {
      const n = result.batchIndex + 1
      const more =
        result.batchSize > 1 && n < result.batchSize ? ` · upload QR ${n + 1}/${result.batchSize}` : ''
      toast(
        result.imported
          ? `Import: ${result.imported} acct. (QR ${n}/${result.batchSize})${more}`
          : `QR ${n}/${result.batchSize} already imported${more}`,
      )
    } else {
      toast('2FA added')
    }
    setModal(false)
    setForm({ label: '', issuer: '', secret: '', uri: '' })
    stopCamera()
  }

  const onQrFile = async (file: File | null) => {
    if (!file) return
    setScanning(true)
    try {
      const data = await decodeQrFromFile(file)
      await importUri(data)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'QR error')
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const startCamera = async () => {
    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setCamOn(true)
      await new Promise((r) => setTimeout(r, 60))
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      timerRef.current = window.setInterval(async () => {
        if (busyRef.current || !videoRef.current) return
        busyRef.current = true
        try {
          const hit = await decodeQrFromVideoFrame(videoRef.current)
          if (hit) await importUri(hit)
        } catch {
          /* keep */
        } finally {
          busyRef.current = false
        }
      }, 400)
    } catch {
      toast('No camera — upload a screenshot or paste a setup key')
      setCamOn(false)
    }
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (form.uri || form.secret) {
        await importUri(form.uri || form.secret)
        return
      }
      await api.createTotp({
        label: form.label,
        issuer: form.issuer,
        secret: form.secret,
      })
      setModal(false)
      setForm({ label: '', issuer: '', secret: '', uri: '' })
      await refresh()
      toast('2FA added')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>2FA / TOTP</h2>
          <p className="sub">QR · Google export · setup key</p>
        </div>
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="ghost-btn"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? 'Reading…' : 'from file'}
          </button>
          <button className="primary-btn" onClick={() => setModal(true)}>
            Add
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onQrFile(e.target.files?.[0] || null)}
      />

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <h3 className="panel-title">Import</h3>
        <p className="hint" style={{ margin: 0 }}>
          Supports standard QR codes, <strong>Google Authenticator export</strong> (otpauth-migration,
          all “1 of N” QR codes) and setup keys (<code>s2z7 2ljd…</code>).
        </p>
        <div className="actions">
          <button className="primary-btn" disabled={scanning} onClick={() => fileRef.current?.click()}>
            {scanning ? 'Scanning…' : 'Upload QR'}
          </button>
          <button className="ghost-btn" onClick={() => (camOn ? stopCamera() : startCamera())}>
            {camOn ? 'Stop' : 'Camera'}
          </button>
          <button
            className="ghost-btn"
            onClick={async () => {
              try {
                await importUri(await navigator.clipboard.readText())
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Clipboard empty')
              }
            }}
          >
            Paste key
          </button>
        </div>
        {camOn && (
          <div className="qr-cam">
            <video ref={videoRef} muted playsInline />
          </div>
        )}
      </div>

      <div className="totp-grid">
        {filtered.length === 0 ? (
          <div className="panel">
            <div className="empty">
              <strong>Empty</strong>
              Upload a QR or paste a setup key.
            </div>
          </div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="panel totp-card">
              <div className="totp-head">
                <div className="entry-title-row">
                  <BrandIcon title={t.label} issuer={t.issuer} size={28} />
                  <div className="totp-titles">
                    <div className="totp-issuer">{t.issuer || '2FA'}</div>
                    <div className="totp-label">{t.label}</div>
                  </div>
                </div>
                <button
                  className="danger-btn"
                  onClick={async () => {
                    if (!confirm('Delete?')) return
                    await api.deleteTotp(t.id)
                    await refresh()
                  }}
                >
                  ×
                </button>
              </div>
              <button
                className="totp-code"
                title="Copy"
                onClick={() =>
                  copySecure(t.code, toast, 'Code copied', 15_000).catch(() => undefined)
                }
              >
                {t.code.length === 6 ? `${t.code.slice(0, 3)} ${t.code.slice(3)}` : t.code}
              </button>
              <div className="totp-bar">
                <span style={{ width: `${(t.remaining / t.period) * 100}%` }} />
              </div>
              <div className="meta">{t.remaining}s</div>
            </div>
          ))
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add 2FA</h3>
            <form className="field-grid" onSubmit={add}>
              <div className="field">
                <label>QR image</label>
                <input type="file" accept="image/*" onChange={(e) => onQrFile(e.target.files?.[0] || null)} />
                {scanning && <span className="meta">Scanning on server… UI stays responsive</span>}
              </div>
              <div className="field">
                <label>Setup key / otpauth / secret</label>
                <input
                  value={form.secret || form.uri}
                  onChange={(e) => setForm({ ...form, secret: e.target.value, uri: e.target.value })}
                  placeholder="s2z7 2ljd oq6e… or otpauth://"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Label / service</label>
                <div className="entry-title-row">
                  <BrandIcon title={form.label} issuer={form.issuer || detectBrand(form.label)?.name || ''} size={36} />
                  <input
                    value={form.label}
                    onChange={(e) => {
                      const label = e.target.value
                      const brand = detectBrand(label)
                      setForm({ ...form, label, issuer: brand?.name || form.issuer })
                    }}
                    placeholder="GitHub, Google…"
                    style={{ flex: 1 }}
                  />
                </div>
                {detectBrand(form.label) && (
                  <span className="meta">Logo: {detectBrand(form.label)!.name}</span>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={scanning}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
