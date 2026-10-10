const TOKEN_KEY = 'locket_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class AuthError extends Error {
  code: string
  constructor(message: string, code = 'AUTH_REQUIRED') {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

type AuthHandler = () => void
let onAuthLost: AuthHandler | null = null

export function setAuthLostHandler(handler: AuthHandler | null) {
  onAuthLost = handler
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...options, headers })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    code?: string
    hint?: string
  }
  if (!res.ok) {
    if (res.status === 401) {
      setToken(null)
      onAuthLost?.()
      throw new AuthError(data.hint || data.error || 'Authentication required', data.code || 'AUTH_REQUIRED')
    }
    const err = new Error(data.error || `Error ${res.status}`) as Error & { code?: string }
    err.code = data.code
    throw err
  }
  return data as T
}

export type Status = { initialized: boolean; unlocked: boolean }

export type EntryListItem = {
  id: string
  title: string
  username: string
  url: string
  notes: string
  category: string
  favorite: boolean
  emailAccountId?: string
  createdAt: string
  updatedAt: string
  hasPassword: boolean
}

export type Entry = EntryListItem & { password: string }

export type Account = {
  id: string
  label: string
  email: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  createdAt: string
  hasPassword: boolean
}

export type MailBox = 'inbox' | 'spam' | 'all'
export type MailFilter = 'all' | 'people' | 'noreply'

export type MailPreview = {
  uid: number
  subject: string
  from: string
  date: string
  seen: boolean
  snippet: string
  mailbox?: string
}

export type MailMessage = MailPreview & {
  to: string
  text: string
  html: string
}

export type LatestMailItem = Partial<MailPreview> & {
  accountId: string
  accountLabel: string
  accountEmail: string
  error?: string
  empty?: boolean
}

export type GenResult = {
  password: string
  entropyBits: number
  strength: string
  crackTime: string
  mode: string
}

export type PasswordLeak = { breached: boolean; count: number; source: string }
export type EmailLeak = {
  email: string
  breached: boolean
  breaches: string[]
  source: string
  hint?: string
}

export type AuditIssue = {
  entryId: string
  title: string
  kind: 'weak' | 'reused' | 'old' | 'empty' | 'breached'
  detail: string
}

export type AuditResult = { score: number; issues: AuditIssue[]; checked: number }

export type SshKeyListItem = {
  id: string
  label: string
  type: string
  comment: string
  publicKey: string
  fingerprint: string
  passphraseProtected: boolean
  createdAt: string
  hasPrivateKey: boolean
}

export type SshKey = SshKeyListItem & { privateKey: string }

export type TotpLive = {
  id: string
  label: string
  issuer: string
  digits: number
  period: number
  algorithm: string
  createdAt: string
  code: string
  remaining: number
}

export type NoteListItem = {
  id: string
  title: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
  preview: string
}

export type Note = {
  id: string
  title: string
  body: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export const api = {
  status: () => request<Status>('/api/status'),
  bootstrap: () =>
    request<{ token: string }>('/api/bootstrap', { method: 'POST', body: JSON.stringify({}) }),
  setup: (password: string) =>
    request<{ token: string }>('/api/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  unlock: (password: string) =>
    request<{ token: string }>('/api/unlock', { method: 'POST', body: JSON.stringify({ password }) }),
  lock: () => request<{ ok: boolean }>('/api/lock', { method: 'POST' }),
  entries: () => request<EntryListItem[]>('/api/entries'),
  entryInsights: () =>
    request<{ reused: string[]; stale: string[]; weak: string[] }>('/api/entries/insights'),
  entry: (id: string) => request<Entry>(`/api/entries/${id}`),
  createEntry: (body: Partial<Entry>) =>
    request<Entry>('/api/entries', { method: 'POST', body: JSON.stringify(body) }),
  updateEntry: (id: string, body: Partial<Entry>) =>
    request<Entry>(`/api/entries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEntry: (id: string) => request<{ ok: boolean }>(`/api/entries/${id}`, { method: 'DELETE' }),
  accounts: () => request<Account[]>('/api/accounts'),
  suggestImap: (email: string) =>
    request<{ host: string; port: number; secure: boolean }>('/api/accounts/suggest', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  createAccount: (body: Record<string, unknown>) =>
    request<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  deleteAccount: (id: string) => request<{ ok: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' }),
  mail: (accountId: string, opts?: { box?: MailBox; filter?: MailFilter; limit?: number }) => {
    const q = new URLSearchParams()
    if (opts?.box) q.set('box', opts.box)
    if (opts?.filter) q.set('filter', opts.filter)
    if (opts?.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    return request<MailPreview[]>(`/api/mail/${accountId}${qs ? `?${qs}` : ''}`)
  },
  mailLatest: () => request<LatestMailItem[]>('/api/mail/latest'),
  message: (accountId: string, uid: number, mailbox?: string) => {
    const q = mailbox ? `?mailbox=${encodeURIComponent(mailbox)}` : ''
    return request<MailMessage>(`/api/mail/${accountId}/${uid}${q}`)
  },
  generate: (opts: Record<string, unknown>) =>
    request<GenResult>('/api/generate', { method: 'POST', body: JSON.stringify(opts) }),
  checkPasswordLeak: (password: string) =>
    request<PasswordLeak>('/api/leaks/password', { method: 'POST', body: JSON.stringify({ password }) }),
  checkEmailLeak: (email: string) =>
    request<EmailLeak>('/api/leaks/email', { method: 'POST', body: JSON.stringify({ email }) }),
  audit: (checkBreaches = false) =>
    request<AuditResult>('/api/audit', { method: 'POST', body: JSON.stringify({ checkBreaches }) }),
  sshKeys: () => request<SshKeyListItem[]>('/api/ssh'),
  sshKey: (id: string) => request<SshKey>(`/api/ssh/${id}`),
  createSsh: (body: Record<string, unknown>) =>
    request<SshKey>('/api/ssh', { method: 'POST', body: JSON.stringify(body) }),
  deleteSsh: (id: string) => request<{ ok: boolean }>(`/api/ssh/${id}`, { method: 'DELETE' }),
  totp: () => request<TotpLive[]>('/api/totp'),
  createTotp: (body: Record<string, unknown>) =>
    request<
      | { id: string }
      | {
          imported: number
          skipped: number
          batchIndex: number
          batchSize: number
          entries: unknown[]
        }
    >('/api/totp', { method: 'POST', body: JSON.stringify(body) }),
  deleteTotp: (id: string) => request<{ ok: boolean }>(`/api/totp/${id}`, { method: 'DELETE' }),
  notes: () => request<NoteListItem[]>('/api/notes'),
  note: (id: string) => request<Note>(`/api/notes/${id}`),
  createNote: (body: Partial<Note>) =>
    request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(body) }),
  updateNote: (id: string, body: Partial<Note>) =>
    request<Note>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteNote: (id: string) => request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
  extStatus: () => request<{ enabled: boolean; token: string | null }>('/api/ext/status'),
  extEnable: () =>
    request<{ enabled: boolean; token: string }>('/api/ext/enable', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  extRotate: () =>
    request<{ enabled: boolean; token: string }>('/api/ext/rotate', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  extDisable: () =>
    request<{ enabled: boolean }>('/api/ext/disable', { method: 'POST', body: JSON.stringify({}) }),
  hub: (opts: { entryId?: string; host?: string }) => {
    const q = new URLSearchParams()
    if (opts.entryId) q.set('entryId', opts.entryId)
    if (opts.host) q.set('host', opts.host)
    return request<SiteHub>(`/api/hub?${q.toString()}`)
  },
}

export type SiteHub = {
  site: { key: string; label: string; domain: string; brandId?: string }
  focusId: string
  accounts: Array<{
    id: string
    title: string
    username: string
    password: string
    url: string
    favorite: boolean
    category: string
    emailAccountId?: string
    notes: string
    updatedAt: string
  }>
  totp: Array<{
    id: string
    label: string
    issuer: string
    code: string
    remaining: number
    period: number
  }>
  mailAccounts: Account[]
  latestMail: MailPreview | null
}
