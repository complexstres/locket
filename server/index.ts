import cors from 'cors'
import express from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditVault } from './audit.js'
import { newSessionToken } from './crypto.js'
import { generatePassword } from './generator.js'
import { checkEmailLeak, checkPasswordLeak } from './leaks.js'
import {
  formatImapError,
  getLatest,
  getMessage,
  listMail,
  normalizeMailPassword,
  suggestImap,
  testConnection,
  type MailBox,
  type MailFilter,
} from './mail.js'
import { decodeTotpQrImage } from './qrImage.js'
import { clearSession, loadSession, saveSession } from './session.js'
import { generateSshKey } from './ssh.js'
import {
  ensureAutoVault,
  initializeVault,
  isInitialized,
  readVault,
  saveDeviceKey,
  unlockVault,
  writeVault,
} from './store.js'
import { disableExtToken, enableExtToken, getExtToken, isValidExtToken, rotateExtToken } from './extToken.js'
import {
  entrySiteMeta,
  hostMatchesEntry,
  linkedTotpForSite,
  liveTotp,
  searchEntries,
} from './match.js'
import { isMigrationUri, parseMigrationUri } from './otpMigration.js'
import { generateTotp, normalizeSecret, parseOtpAuthUri } from './totp.js'
import type { EmailAccount, SecureNote, SshKey, TotpEntry, VaultEntry } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.LOCKET_PORT || 3847)

app.use(cors())
app.use(express.json({ limit: '12mb' }))

type Session = { token: string; key: Buffer; lastActive: number }
const SESSION_TTL_MS = 1000 * 60 * 60 * 12
let session: Session | null = loadSession(SESSION_TTL_MS)

function touchSession() {
  if (!session) return
  session.lastActive = Date.now()
  saveSession(session)
}

function setSession(next: Session | null) {
  session = next
  if (next) {
    saveSession(next)
    saveDeviceKey(next.key)
  } else clearSession()
}

function requireAuth(req: express.Request, res: express.Response): Session | null {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!session || session.token !== token) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
      hint: 'Session reset — enter your master password again',
    })
    return null
  }
  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    setSession(null)
    res.status(401).json({ error: 'Session expired', code: 'AUTH_EXPIRED' })
    return null
  }
  touchSession()
  return session
}

/** Session OR browser-extension token (local autofill / quick picker). */
function requireVaultAccess(req: express.Request, res: express.Response): Session | null {
  const ext = String(req.headers['x-locket-ext'] || '')
  if (ext && isValidExtToken(ext)) {
    if (!session) {
      try {
        const { key } = ensureAutoVault()
        const token = newSessionToken()
        setSession({ token, key, lastActive: Date.now() })
      } catch {
        res.status(503).json({ error: 'Vault unavailable', code: 'VAULT_LOCKED' })
        return null
      }
    }
    touchSession()
    return session
  }
  return requireAuth(req, res)
}

app.get('/api/status', (_req, res) => {
  res.json({ initialized: isInitialized(), unlocked: Boolean(session), auto: true })
})

/** Open app without master password */
app.post('/api/bootstrap', (_req, res) => {
  try {
    if (session) {
      touchSession()
      saveDeviceKey(session.key)
      res.json({ token: session.token })
      return
    }
    const { key } = ensureAutoVault()
    const token = newSessionToken()
    setSession({ token, key, lastActive: Date.now() })
    res.json({ token })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    if (msg === 'NEEDS_MIGRATE') {
      res.status(409).json({
        error: 'Legacy password-protected vault. Enter your old master password once to switch to passwordless access.',
        code: 'NEEDS_MIGRATE',
      })
      return
    }
    res.status(500).json({ error: msg })
  }
})

app.post('/api/setup', (req, res) => {
  try {
    const { password } = req.body as { password?: string }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Master password must be at least 6 characters' })
      return
    }
    const { key } = initializeVault(password)
    const token = newSessionToken()
    setSession({ token, key, lastActive: Date.now() })
    res.json({ token })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Error' })
  }
})

app.post('/api/unlock', (req, res) => {
  try {
    const { password } = req.body as { password?: string }
    if (!password) {
      res.status(400).json({ error: 'Enter password' })
      return
    }
    const { key } = unlockVault(password)
    const token = newSessionToken()
    setSession({ token, key, lastActive: Date.now() })
    res.json({ token })
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'Error' })
  }
})

app.post('/api/lock', (_req, res) => {
  // keep device key — "lock" just clears memory session; bootstrap reopens instantly
  session = null
  clearSession()
  res.json({ ok: true })
})

/* ——— entries ——— */
app.get('/api/entries', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  res.json(data.entries.map(({ password: _p, ...rest }) => ({ ...rest, hasPassword: Boolean(_p) })))
})

function passwordStrengthScore(password: string) {
  let s = 0
  if (password.length >= 8) s += 1
  if (password.length >= 12) s += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s += 1
  if (/\d/.test(password)) s += 1
  if (/[^a-zA-Z0-9]/.test(password)) s += 1
  return s
}

/** Password health without leaking secrets: reused / stale / weak flags by id */
app.get('/api/entries/insights', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  const byHash = new Map<string, string[]>()
  const reused: string[] = []
  const stale: string[] = []
  const weak: string[] = []
  const now = Date.now()
  const STALE_MS = 180 * 24 * 60 * 60 * 1000

  for (const e of data.entries) {
    if (e.password) {
      const h = createHash('sha256').update(e.password).digest('hex')
      const list = byHash.get(h) || []
      list.push(e.id)
      byHash.set(h, list)
      if (passwordStrengthScore(e.password) <= 2) weak.push(e.id)
    }
    const updated = Date.parse(e.updatedAt || e.createdAt)
    if (Number.isFinite(updated) && now - updated > STALE_MS) stale.push(e.id)
  }
  for (const ids of byHash.values()) {
    if (ids.length > 1) reused.push(...ids)
  }
  res.json({
    reused: Array.from(new Set(reused)),
    stale: Array.from(new Set(stale)),
    weak: Array.from(new Set(weak)),
  })
})

app.get('/api/entries/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const entry = readVault(s.key).entries.find((e) => e.id === req.params.id)
  if (!entry) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(entry)
})

app.post('/api/entries', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const body = req.body as Partial<VaultEntry>
  const now = new Date().toISOString()
  const entry: VaultEntry = {
    id: randomUUID(),
    title: (body.title || 'Untitled').trim(),
    username: (body.username || '').trim(),
    password: body.password || '',
    url: (body.url || '').trim(),
    notes: body.notes || '',
    category: (body.category || 'General').trim(),
    favorite: Boolean(body.favorite),
    emailAccountId: body.emailAccountId,
    createdAt: now,
    updatedAt: now,
  }
  const data = readVault(s.key)
  data.entries.unshift(entry)
  writeVault(s.key, data)
  res.json(entry)
})

app.put('/api/entries/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  const idx = data.entries.findIndex((e) => e.id === req.params.id)
  if (idx < 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const body = req.body as Partial<VaultEntry>
  const prev = data.entries[idx]!
  data.entries[idx] = {
    ...prev,
    title: body.title !== undefined ? body.title.trim() : prev.title,
    username: body.username !== undefined ? body.username.trim() : prev.username,
    password: body.password !== undefined ? body.password : prev.password,
    url: body.url !== undefined ? body.url.trim() : prev.url,
    notes: body.notes !== undefined ? body.notes : prev.notes,
    category: body.category !== undefined ? body.category.trim() : prev.category,
    favorite: body.favorite !== undefined ? Boolean(body.favorite) : prev.favorite,
    emailAccountId: body.emailAccountId !== undefined ? body.emailAccountId : prev.emailAccountId,
    updatedAt: new Date().toISOString(),
  }
  writeVault(s.key, data)
  res.json(data.entries[idx])
})

app.delete('/api/entries/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  data.entries = data.entries.filter((e) => e.id !== req.params.id)
  writeVault(s.key, data)
  res.json({ ok: true })
})

/* ——— mail accounts ——— */
app.get('/api/accounts', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  res.json(
    readVault(s.key).accounts.map(({ password: _p, ...rest }) => ({
      ...rest,
      hasPassword: Boolean(_p),
    })),
  )
})

app.post('/api/accounts/suggest', (req, res) => {
  const { email } = req.body as { email?: string }
  if (!email) {
    res.status(400).json({ error: 'Email required' })
    return
  }
  res.json(suggestImap(email))
})

app.post('/api/accounts', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const body = req.body as Partial<EmailAccount> & { test?: boolean }
  if (!body.email || !body.password || !body.imapHost) {
    res.status(400).json({ error: 'Fill in email, password, and IMAP' })
    return
  }
  const account: EmailAccount = {
    id: randomUUID(),
    label: (body.label || body.email).trim(),
    email: body.email.trim().toLowerCase(),
    imapHost: body.imapHost.trim(),
    imapPort: Number(body.imapPort) || 993,
    imapSecure: body.imapSecure !== false,
    password: normalizeMailPassword(body.password),
    createdAt: new Date().toISOString(),
  }

  if (account.password.length < 8) {
    res.status(400).json({
      error:
        'Password too short. Gmail requires a 16-character app password (no spaces).',
    })
    return
  }

  try {
    if (body.test !== false) await testConnection(account)
  } catch (e) {
    res.status(400).json({
      error: `Could not connect: ${formatImapError(e)}`,
    })
    return
  }
  const data = readVault(s.key)
  data.accounts.push(account)
  writeVault(s.key, data)
  const { password: _p, ...safe } = account
  res.json(safe)
})

app.delete('/api/accounts/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  data.accounts = data.accounts.filter((a) => a.id !== req.params.id)
  data.entries = data.entries.map((e) =>
    e.emailAccountId === req.params.id ? { ...e, emailAccountId: undefined } : e,
  )
  writeVault(s.key, data)
  res.json({ ok: true })
})

app.get('/api/mail/latest', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  if (data.accounts.length === 0) {
    res.json([])
    return
  }
  const results = await Promise.all(
    data.accounts.map(async (account) => {
      try {
        const msg = await getLatest(account)
        if (!msg) {
          return {
            accountId: account.id,
            accountLabel: account.label,
            accountEmail: account.email,
            empty: true,
          }
        }
        return {
          ...msg,
          accountId: account.id,
          accountLabel: account.label,
          accountEmail: account.email,
        }
      } catch (e) {
        return {
          accountId: account.id,
          accountLabel: account.label,
          accountEmail: account.email,
          error: formatImapError(e),
        }
      }
    }),
  )
  res.json(results)
})

app.get('/api/mail/:accountId', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const account = readVault(s.key).accounts.find((a) => a.id === req.params.accountId)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  try {
    const box = String(req.query.box || 'inbox') as MailBox
    const filter = String(req.query.filter || 'all') as MailFilter
    res.json(
      await listMail(account, {
        box: ['inbox', 'spam', 'all'].includes(box) ? box : 'inbox',
        filter: ['all', 'people', 'noreply'].includes(filter) ? filter : 'all',
        limit: Number(req.query.limit) || 40,
      }),
    )
  } catch (e) {
    res.status(502).json({ error: formatImapError(e) })
  }
})

app.get('/api/mail/:accountId/:uid', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const account = readVault(s.key).accounts.find((a) => a.id === req.params.accountId)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  try {
    const mailbox = String(req.query.mailbox || 'INBOX')
    res.json(await getMessage(account, Number(req.params.uid), mailbox))
  } catch (e) {
    res.status(502).json({ error: formatImapError(e) })
  }
})

/* ——— heavy generator ——— */
app.post('/api/generate', (req, res) => {
  try {
    res.json(generatePassword(req.body || {}))
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Error' })
  }
})

app.get('/api/password', (req, res) => {
  res.json(
    generatePassword({
      mode: (req.query.mode as 'random' | 'heavy') || 'random',
      length: Number(req.query.length) || 16,
      upper: req.query.upper !== '0',
      lower: req.query.lower !== '0',
      digits: req.query.digits !== '0',
      symbols: req.query.symbols === '1',
      ambiguous: req.query.ambiguous !== '0',
    }),
  )
})

/* ——— leak checks ——— */
app.post('/api/leaks/password', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const { password } = req.body as { password?: string }
  if (!password) {
    res.status(400).json({ error: 'Provide a password' })
    return
  }
  try {
    res.json(await checkPasswordLeak(password))
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Check failed' })
  }
})

app.post('/api/leaks/email', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const { email } = req.body as { email?: string }
  if (!email) {
    res.status(400).json({ error: 'Provide an email' })
    return
  }
  try {
    res.json(await checkEmailLeak(email))
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Check failed' })
  }
})

app.post('/api/audit', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const { checkBreaches } = req.body as { checkBreaches?: boolean }
  try {
    const data = readVault(s.key)
    res.json(await auditVault(data.entries, { checkBreaches: Boolean(checkBreaches) }))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Audit failed' })
  }
})

/* ——— SSH ——— */
app.get('/api/ssh', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  res.json(
    readVault(s.key).sshKeys.map(({ privateKey: _p, ...rest }) => ({
      ...rest,
      hasPrivateKey: Boolean(_p),
    })),
  )
})

app.get('/api/ssh/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const key = readVault(s.key).sshKeys.find((k) => k.id === req.params.id)
  if (!key) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(key)
})

app.post('/api/ssh', async (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const body = req.body as {
    label?: string
    type?: 'ed25519' | 'rsa' | 'ecdsa'
    comment?: string
    passphrase?: string
  }
  try {
    const generated = await generateSshKey({
      type: body.type,
      comment: body.comment,
      passphrase: body.passphrase,
    })
    const key: SshKey = {
      id: randomUUID(),
      label: (body.label || generated.comment || 'SSH key').trim(),
      type: generated.type,
      comment: generated.comment,
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      fingerprint: generated.fingerprint,
      passphraseProtected: generated.passphraseProtected,
      createdAt: new Date().toISOString(),
    }
    const data = readVault(s.key)
    data.sshKeys.unshift(key)
    writeVault(s.key, data)
    res.json(key)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Generation failed' })
  }
})

app.delete('/api/ssh/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  data.sshKeys = data.sshKeys.filter((k) => k.id !== req.params.id)
  writeVault(s.key, data)
  res.json({ ok: true })
})

/* ——— TOTP ——— */
app.get('/api/totp', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  res.json(
    data.totp.map((t) => {
      try {
        const code = generateTotp(t.secret, {
          digits: t.digits,
          period: t.period,
          algorithm: t.algorithm,
        })
        return {
          id: t.id,
          label: t.label,
          issuer: t.issuer,
          digits: t.digits,
          period: t.period,
          algorithm: t.algorithm,
          createdAt: t.createdAt,
          ...code,
        }
      } catch {
        return {
          id: t.id,
          label: t.label,
          issuer: t.issuer,
          digits: t.digits,
          period: t.period,
          algorithm: t.algorithm,
          createdAt: t.createdAt,
          code: '------',
          remaining: 0,
        }
      }
    }),
  )
})

/** Decode-only: no vault access required (avoids false "QR not found" when session drops). */
app.post('/api/totp/qr-image', async (req, res) => {
  try {
    const { image } = req.body as { image?: string }
    if (!image) {
      res.status(400).json({ error: 'No image' })
      return
    }
    const uri = await decodeTotpQrImage(image)
    res.json({ uri })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'QR error' })
  }
})

app.post('/api/totp', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const body = req.body as Partial<TotpEntry> & { uri?: string }
  try {
    // Google Authenticator export (otpauth-migration://) — may contain many accounts
    if (body.uri && isMigrationUri(body.uri)) {
      const batch = parseMigrationUri(body.uri)
      if (!batch.accounts.length) {
        res.status(400).json({ error: 'This export QR contains no TOTP accounts' })
        return
      }
      const data = readVault(s.key)
      const created: TotpEntry[] = []
      for (const acc of batch.accounts) {
        const dup = data.totp.some(
          (t) => t.secret === acc.secret && t.issuer === acc.issuer && t.label === acc.label,
        )
        if (dup) continue
        generateTotp(acc.secret, acc)
        const entry: TotpEntry = {
          id: randomUUID(),
          label: acc.label,
          issuer: acc.issuer,
          secret: acc.secret,
          digits: acc.digits,
          period: acc.period,
          algorithm: acc.algorithm,
          createdAt: new Date().toISOString(),
        }
        data.totp.unshift(entry)
        created.push(entry)
      }
      writeVault(s.key, data)
      res.json({
        imported: created.length,
        skipped: batch.accounts.length - created.length,
        batchIndex: batch.batchIndex,
        batchSize: batch.batchSize,
        entries: created.map(({ secret: _s, ...rest }) => rest),
      })
      return
    }

    let payload = {
      label: (body.label || '2FA').trim(),
      issuer: (body.issuer || '').trim(),
      secret: normalizeSecret(body.secret || ''),
      digits: body.digits || 6,
      period: body.period || 30,
      algorithm: (body.algorithm || 'SHA1') as TotpEntry['algorithm'],
    }
    if (body.uri) payload = { ...payload, ...parseOtpAuthUri(body.uri) }
    if (!payload.secret) {
      res.status(400).json({ error: 'Secret or otpauth:// URI required' })
      return
    }
    generateTotp(payload.secret, payload) // validate
    const entry: TotpEntry = {
      id: randomUUID(),
      ...payload,
      createdAt: new Date().toISOString(),
    }
    const data = readVault(s.key)
    data.totp.unshift(entry)
    writeVault(s.key, data)
    res.json(entry)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Error' })
  }
})

app.delete('/api/totp/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  data.totp = data.totp.filter((t) => t.id !== req.params.id)
  writeVault(s.key, data)
  res.json({ ok: true })
})

/* ——— secure notes ——— */
app.get('/api/notes', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  res.json(
    readVault(s.key).notes.map(({ body: _b, ...rest }) => ({
      ...rest,
      preview: _b.slice(0, 80),
    })),
  )
})

app.get('/api/notes/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const note = readVault(s.key).notes.find((n) => n.id === req.params.id)
  if (!note) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(note)
})

app.post('/api/notes', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const body = req.body as Partial<SecureNote>
  const now = new Date().toISOString()
  const note: SecureNote = {
    id: randomUUID(),
    title: (body.title || 'Note').trim(),
    body: body.body || '',
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    favorite: Boolean(body.favorite),
    createdAt: now,
    updatedAt: now,
  }
  const data = readVault(s.key)
  data.notes.unshift(note)
  writeVault(s.key, data)
  res.json(note)
})

app.put('/api/notes/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  const idx = data.notes.findIndex((n) => n.id === req.params.id)
  if (idx < 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const body = req.body as Partial<SecureNote>
  const prev = data.notes[idx]!
  data.notes[idx] = {
    ...prev,
    title: body.title !== undefined ? body.title.trim() : prev.title,
    body: body.body !== undefined ? body.body : prev.body,
    tags: body.tags !== undefined ? body.tags.map(String) : prev.tags,
    favorite: body.favorite !== undefined ? Boolean(body.favorite) : prev.favorite,
    updatedAt: new Date().toISOString(),
  }
  writeVault(s.key, data)
  res.json(data.notes[idx])
})

app.delete('/api/notes/:id', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const data = readVault(s.key)
  data.notes = data.notes.filter((n) => n.id !== req.params.id)
  writeVault(s.key, data)
  res.json({ ok: true })
})

/* ——— browser extension + quick picker ——— */
app.get('/api/ext/status', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const token = getExtToken()
  res.json({ enabled: Boolean(token), token: token || null })
})

app.post('/api/ext/enable', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const token = enableExtToken()
  res.json({ enabled: true, token })
})

app.post('/api/ext/rotate', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  const token = rotateExtToken()
  res.json({ enabled: true, token })
})

app.post('/api/ext/disable', (req, res) => {
  const s = requireAuth(req, res)
  if (!s) return
  disableExtToken()
  res.json({ enabled: false })
})

app.get('/api/ext/match', (req, res) => {
  const s = requireVaultAccess(req, res)
  if (!s) return
  const host = String(req.query.host || '')
    .replace(/^www\./, '')
    .toLowerCase()
    .trim()
  if (!host) {
    res.status(400).json({ error: 'Host required' })
    return
  }
  const data = readVault(s.key)
  const ranked = data.entries
    .map((e) => ({ e, score: hostMatchesEntry(host, e) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
  res.json(
    ranked.map(({ e, score }) => ({
      id: e.id,
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
      favorite: e.favorite,
      score,
    })),
  )
})

app.get('/api/ext/search', (req, res) => {
  const s = requireVaultAccess(req, res)
  if (!s) return
  const q = String(req.query.q || '')
  const data = readVault(s.key)
  const list = searchEntries(data.entries, q, 30)
  res.json(
    list.map((e) => ({
      id: e.id,
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
      favorite: e.favorite,
      category: e.category,
    })),
  )
})

app.get('/api/ext/entry/:id', (req, res) => {
  const s = requireVaultAccess(req, res)
  if (!s) return
  const data = readVault(s.key)
  const entry = data.entries.find((e) => e.id === req.params.id)
  if (!entry) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const site = entrySiteMeta(entry)
  const totp = linkedTotpForSite(data.totp, site, entry, 8).map(liveTotp)
  res.json({
    ...entry,
    site,
    totp,
  })
})

/** Unified hub: site accounts + 2FA + linked mail */
app.get('/api/hub', async (req, res) => {
  const s = requireVaultAccess(req, res)
  if (!s) return
  const entryId = String(req.query.entryId || '')
  const host = String(req.query.host || '')
    .replace(/^www\./, '')
    .toLowerCase()
  const data = readVault(s.key)

  let focus = entryId ? data.entries.find((e) => e.id === entryId) : undefined
  if (!focus && host) {
    focus = data.entries
      .map((e) => ({ e, score: hostMatchesEntry(host, e) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.e
  }
  if (!focus) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  const site = entrySiteMeta(focus)
  const accounts = data.entries
    .filter((e) => entrySiteMeta(e).key === site.key)
    .map((e) => ({
      id: e.id,
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
      favorite: e.favorite,
      category: e.category,
      emailAccountId: e.emailAccountId,
      notes: e.notes,
      updatedAt: e.updatedAt,
    }))

  const totp = linkedTotpForSite(data.totp, site, focus, 6).map(liveTotp)

  const mailAccountIds = Array.from(
    new Set(accounts.map((a) => a.emailAccountId).filter(Boolean) as string[]),
  )
  const mailAccounts = data.accounts
    .filter((a) => mailAccountIds.includes(a.id))
    .map(({ password: _p, ...rest }) => rest)

  let latestMail: Awaited<ReturnType<typeof getLatest>> | null = null
  const mailId = focus.emailAccountId || mailAccountIds[0]
  if (mailId) {
    const acc = data.accounts.find((a) => a.id === mailId)
    if (acc) {
      try {
        latestMail = await getLatest(acc)
      } catch {
        latestMail = null
      }
    }
  }

  res.json({
    site,
    focusId: focus.id,
    accounts,
    totp,
    mailAccounts,
    latestMail,
  })
})

const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    // SPA fallback only for app routes — keep picker.html as real file
    if (req.path.includes('.')) return next()
    res.sendFile(join(distDir, 'index.html'))
  })
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Locket API → http://127.0.0.1:${PORT}`)
})
