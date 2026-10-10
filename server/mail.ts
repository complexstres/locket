import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { EmailAccount } from './types.js'

export type MailBox = 'inbox' | 'spam' | 'all'
export type MailFilter = 'all' | 'people' | 'noreply'

export type MailPreview = {
  uid: number
  subject: string
  from: string
  date: string
  seen: boolean
  snippet: string
  mailbox: string
}

export type MailMessage = MailPreview & {
  to: string
  text: string
  html: string
}

const PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  'gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'googlemail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'outlook.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'hotmail.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'live.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  'yandex.ru': { host: 'imap.yandex.ru', port: 993, secure: true },
  'yandex.com': { host: 'imap.yandex.com', port: 993, secure: true },
  'mail.ru': { host: 'imap.mail.ru', port: 993, secure: true },
  'bk.ru': { host: 'imap.mail.ru', port: 993, secure: true },
  'list.ru': { host: 'imap.mail.ru', port: 993, secure: true },
  'inbox.ru': { host: 'imap.mail.ru', port: 993, secure: true },
  'icloud.com': { host: 'imap.mail.me.com', port: 993, secure: true },
  'me.com': { host: 'imap.mail.me.com', port: 993, secure: true },
}

const BOT_FROM =
  /no[-_]?reply|do[-_]?not[-_]?reply|mailer[-_]?daemon|postmaster|newsletter|notifications?|news@|promo@|marketing@|support@|noreply@|bounce|automated|daemon@|alert@|updates?@|digest@|info@.*mail\.|receipts?@|billing@|invoice@/i

const IDLE_MS = 3 * 60 * 1000
const mailboxCache = new Map<string, Partial<Record<MailBox, string>>>()

type PoolEntry = {
  client: ImapFlow
  queue: Promise<unknown>
  timer: ReturnType<typeof setTimeout> | null
  key: string
}

const pool = new Map<string, PoolEntry>()

export function normalizeMailPassword(password: string): string {
  return password.replace(/\s+/g, '').trim()
}

export function suggestImap(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return PRESETS[domain] ?? { host: `imap.${domain}`, port: 993, secure: true }
}

export function formatImapError(err: unknown): string {
  const anyErr = err as {
    message?: string
    responseText?: string
    authenticationFailed?: boolean
  }
  const raw = [anyErr.responseText, anyErr.message, String(err)]
    .filter(Boolean)
    .join(' — ')
    .toLowerCase()

  if (
    anyErr.authenticationFailed ||
    /auth|invalid credentials|login failed|username and password|application-specific|web login required|please log in/i.test(
      raw,
    )
  ) {
    return (
      'Gmail rejected sign-in. Use a 16-character app password, not your regular password. ' +
      'In Google Account: 2FA → App passwords. IMAP must be enabled in Gmail settings.'
    )
  }

  if (/timeout|etimedout|econnrefused|enotfound|network|socket/i.test(raw)) {
    return 'Cannot reach mail server. Check internet / VPN / firewall.'
  }

  if (/certificate|tls|ssl/i.test(raw)) {
    return 'TLS/SSL error connecting to IMAP.'
  }

  const short = (anyErr.responseText || anyErr.message || 'Command failed').trim()
  if (/^command failed$/i.test(short)) {
    return 'IMAP command failed (often wrong app password or IMAP disabled).'
  }
  return short
}

function accountKey(account: EmailAccount): string {
  return `${account.email}|${account.imapHost}|${account.imapPort}`
}

function formatFrom(addr?: { name?: string | null; address?: string | null } | null): string {
  if (!addr) return 'Unknown'
  return `${addr.name || ''} <${addr.address || ''}>`.trim()
}

function isPeopleMail(from: string): boolean {
  if (!from || from === 'Unknown') return false
  if (BOT_FROM.test(from)) return false
  const email = from.match(/[\w.+-]+@[\w.-]+/)?.[0] || from
  if (/^(noreply|no-reply|mailer|newsletter|notification)/i.test(email)) return false
  return true
}

function applyFilter(list: MailPreview[], filter: MailFilter): MailPreview[] {
  if (filter === 'people') return list.filter((m) => isPeopleMail(m.from))
  if (filter === 'noreply') return list.filter((m) => !isPeopleMail(m.from))
  return list
}

async function destroyPoolEntry(key: string) {
  const entry = pool.get(key)
  if (!entry) return
  pool.delete(key)
  if (entry.timer) clearTimeout(entry.timer)
  try {
    await entry.client.logout()
  } catch {
    try {
      entry.client.close()
    } catch {
      /* ignore */
    }
  }
}

function touchIdle(entry: PoolEntry) {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    destroyPoolEntry(entry.key).catch(() => undefined)
  }, IDLE_MS)
}

async function getPooledClient(account: EmailAccount): Promise<PoolEntry> {
  const key = accountKey(account)
  const existing = pool.get(key)
  if (existing && existing.client.usable) {
    touchIdle(existing)
    return existing
  }
  if (existing) await destroyPoolEntry(key)

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: {
      user: account.email.trim(),
      pass: normalizeMailPassword(account.password),
    },
    logger: false,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    tls: {
      servername: account.imapHost,
      minVersion: 'TLSv1.2',
    },
  })

  await client.connect()
  const entry: PoolEntry = { client, queue: Promise.resolve(), timer: null, key }
  pool.set(key, entry)
  touchIdle(entry)
  return entry
}

/** Serialize IMAP commands on one connection (IMAP is not parallel-safe). */
async function withClient<T>(account: EmailAccount, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  try {
    const entry = await getPooledClient(account)
    const run = entry.queue.then(() => fn(entry.client))
    entry.queue = run.then(
      () => undefined,
      () => undefined,
    )
    const result = await run
    touchIdle(entry)
    return result
  } catch (err) {
    const key = accountKey(account)
    await destroyPoolEntry(key)
    throw new Error(formatImapError(err))
  }
}

async function resolveMailbox(client: ImapFlow, account: EmailAccount, box: MailBox): Promise<string> {
  if (box === 'inbox') return 'INBOX'

  const key = accountKey(account)
  const cached = mailboxCache.get(key)?.[box]
  if (cached) return cached

  const wanted =
    box === 'spam'
      ? [/spam/i, /junk/i, /\[gmail\]\/spam/i, /спам/i]
      : [/all mail/i, /\[gmail\]\/all mail/i, /archive/i, /все/i]

  let path = box === 'spam' ? '[Gmail]/Spam' : '[Gmail]/All Mail'
  try {
    const folders = await client.list()
    for (const pattern of wanted) {
      const hit = folders.find((f) => pattern.test(f.path) || pattern.test(f.specialUse || ''))
      if (hit) {
        path = hit.path
        break
      }
    }
    if (box === 'spam') {
      const special = folders.find((f) => f.specialUse === '\\Junk')
      if (special) path = special.path
    }
    if (box === 'all') {
      const all = folders.find((f) => f.specialUse === '\\All')
      if (all) path = all.path
    }
  } catch {
    /* defaults */
  }

  const map = mailboxCache.get(key) || {}
  map[box] = path
  mailboxCache.set(key, map)
  return path
}

async function fetchFromBox(
  client: ImapFlow,
  mailbox: string,
  limit: number,
): Promise<MailPreview[]> {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const total = client.mailbox?.exists ?? 0
    if (total === 0) return []

    const from = Math.max(1, total - limit + 1)
    const messages: MailPreview[] = []

    // Only envelope/flags — no body download (huge speedup)
    for await (const msg of client.fetch(`${from}:${total}`, {
      uid: true,
      flags: true,
      envelope: true,
    })) {
      const fromAddr = msg.envelope?.from?.[0]
      const fromStr = formatFrom(fromAddr)
      messages.push({
        uid: msg.uid,
        subject: msg.envelope?.subject || '(no subject)',
        from: fromStr,
        date: msg.envelope?.date?.toISOString() || new Date().toISOString(),
        seen: msg.flags?.has('\\Seen') ?? false,
        snippet: fromStr,
        mailbox,
      })
    }

    return messages.reverse()
  } finally {
    lock.release()
  }
}

export async function testConnection(account: EmailAccount): Promise<boolean> {
  await withClient(account, async (client) => {
    await client.mailboxOpen('INBOX')
  })
  return true
}

export async function listMail(
  account: EmailAccount,
  opts: { box?: MailBox; filter?: MailFilter; limit?: number } = {},
): Promise<MailPreview[]> {
  const box = opts.box || 'inbox'
  const filter = opts.filter || 'all'
  const limit = Math.min(50, Math.max(5, opts.limit || 30))

  return withClient(account, async (client) => {
    const mailbox = await resolveMailbox(client, account, box)
    try {
      const list = await fetchFromBox(client, mailbox, limit)
      return applyFilter(list, filter)
    } catch (err) {
      if (box === 'inbox') throw err
      const list = await fetchFromBox(client, 'INBOX', limit)
      return applyFilter(list, filter)
    }
  })
}

export async function listInbox(account: EmailAccount, limit = 30): Promise<MailPreview[]> {
  return listMail(account, { box: 'inbox', filter: 'all', limit })
}

export async function getLatest(account: EmailAccount): Promise<MailPreview | null> {
  const list = await listMail(account, { box: 'inbox', filter: 'all', limit: 1 })
  return list[0] ?? null
}

export async function getMessage(
  account: EmailAccount,
  uid: number,
  mailbox = 'INBOX',
): Promise<MailMessage> {
  return withClient(account, async (client) => {
    let path = mailbox || 'INBOX'
    const lock = await client.getMailboxLock(path).catch(async () => {
      path = 'INBOX'
      return client.getMailboxLock('INBOX')
    })

    try {
      // Prefer lightweight text download; fall back to full source
      let text = ''
      let html = ''
      let subject = '(no subject)'
      let from = 'Unknown'
      let to = ''
      let date = new Date().toISOString()
      let seen = false

      const meta = await client.fetchOne(
        String(uid),
        { uid: true, flags: true, envelope: true },
        { uid: true },
      )
      if (!meta) throw new Error('Message not found')

      subject = meta.envelope?.subject || subject
      from = formatFrom(meta.envelope?.from?.[0])
      to = formatFrom(meta.envelope?.to?.[0])
      date = meta.envelope?.date?.toISOString() || date
      seen = meta.flags?.has('\\Seen') ?? false

      try {
        const downloaded = await client.download(String(uid), undefined, {
          uid: true,
          maxBytes: 400_000,
        })
        if (downloaded?.content) {
          const chunks: Buffer[] = []
          for await (const chunk of downloaded.content) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            if (Buffer.concat(chunks).length > 400_000) break
          }
          const parsed = await simpleParser(Buffer.concat(chunks))
          text = parsed.text || ''
          html = typeof parsed.html === 'string' ? parsed.html : ''
          if (!text && !html) text = '(empty message)'
        }
      } catch {
        text = 'Could not load message body'
      }

      return {
        uid,
        subject,
        from,
        to,
        date,
        seen,
        snippet: text.replace(/\s+/g, ' ').trim().slice(0, 140),
        text,
        html,
        mailbox: path,
      }
    } finally {
      lock.release()
    }
  })
}
