import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { api, setAuthLostHandler, setToken } from './api'
import type {
  Account,
  EntryListItem,
  LatestMailItem,
  MailBox,
  MailFilter,
  MailMessage,
  MailPreview,
} from './api'
import { GeneratorHeavy } from './views/GeneratorHeavy'
import { NotesView } from './views/NotesView'
import { SecurityView } from './views/SecurityView'
import { SshView } from './views/SshView'
import { TotpView } from './views/TotpView'
import { VaultView } from './views/VaultView'
import './App.css'

type Tab = 'vault' | 'mail' | 'generator' | 'security' | 'ssh' | 'totp' | 'notes'

declare global {
  interface Window {
    locketDesktop?: {
      isDesktop: boolean
      platform: string
      minimize: () => Promise<void>
      maximize: () => Promise<boolean>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      onState: (cb: (s: { maximized: boolean }) => void) => () => void
    }
  }
}

function isDesktopApp() {
  return Boolean(window.locketDesktop?.isDesktop) || navigator.userAgent.includes('Electron')
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden>
      <img src="/brand-mark.svg" alt="" width={38} height={38} />
    </div>
  )
}

function TitleBar() {
  const desk = window.locketDesktop
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!desk) return
    desk.isMaximized().then(setMaximized).catch(() => undefined)
    return desk.onState((s) => setMaximized(s.maximized))
  }, [desk])

  if (!isDesktopApp()) return null

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <span className="titlebar-dot" />
        <span className="titlebar-title">Locket</span>
      </div>
      <div className="titlebar-actions">
        <button type="button" aria-label="Minimize" onClick={() => desk?.minimize()}>
          ─
        </button>
        <button type="button" aria-label="Maximize" onClick={() => desk?.maximize()}>
          {maximized ? '❐' : '□'}
        </button>
        <button type="button" className="win-close" aria-label="Close" onClick={() => desk?.close()}>
          ✕
        </button>
      </div>
    </header>
  )
}

function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <div className={`desktop-root ${isDesktopApp() ? 'is-electron' : ''}`}>
      <TitleBar />
      {children}
    </div>
  )
}

function useToast() {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const toast = (text: string) => {
    setMsg(text)
    setShow(true)
    window.setTimeout(() => setShow(false), 2200)
  }
  return { msg, show, toast }
}

/** One-time migrate from old password vault → then no password forever */
function MigrateGate({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.unlock(password)
      setToken(res.token)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <BrandMark />
        <h1>Locket</h1>
        <p className="lead">
          Enter your old master password once — after that, sign-in is passwordless.
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Old master password</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? 'One moment…' : 'Continue without password'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AccountModal({ onClose, onSave }: { onClose: () => void; onSave: () => Promise<void> }) {
  const [form, setForm] = useState({
    label: '',
    email: '',
    password: '',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    skipTest: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const onEmailBlur = async () => {
    if (!form.email.includes('@')) return
    try {
      const s = await api.suggestImap(form.email)
      setForm((f) => ({
        ...f,
        imapHost: f.imapHost || s.host,
        imapPort: f.imapHost ? f.imapPort : s.port,
        imapSecure: f.imapHost ? f.imapSecure : s.secure,
        label: f.label || form.email,
      }))
    } catch {
      /* ignore */
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.createAccount({ ...form, test: !form.skipTest })
      await onSave()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add mail account</h3>
        <form onSubmit={submit} className="field-grid">
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              onBlur={onEmailBlur}
              required
              placeholder="you@gmail.com"
            />
          </div>
          <div className="field">
            <label>Label</label>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Personal / Work"
            />
          </div>
          <div className="field">
            <label>App password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              placeholder="xxxx xxxx xxxx xxxx"
            />
          </div>
          <div className="field">
            <label>IMAP host</label>
            <input
              value={form.imapHost}
              onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
              required
              placeholder="imap.gmail.com"
            />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              type="number"
              value={form.imapPort}
              onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })}
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.imapSecure}
              onChange={(e) => setForm({ ...form, imapSecure: e.target.checked })}
            />
            SSL/TLS
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.skipTest}
              onChange={(e) => setForm({ ...form, skipTest: e.target.checked })}
            />
            Save without testing connection
          </label>
          <p className="hint" style={{ margin: 0 }}>
            Gmail requires an app password:{' '}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
            >
              myaccount.google.com/apppasswords
            </a>
            . Paste as-is — we strip spaces. Your regular Google password will not work.
          </p>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Connecting…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MailView({
  accounts,
  onRefresh,
  toast,
}: {
  accounts: Account[]
  onRefresh: () => Promise<void>
  toast: (t: string) => void
}) {
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null)
  const [messages, setMessages] = useState<MailPreview[]>([])
  const [selected, setSelected] = useState<MailMessage | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [latestLoading, setLatestLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [box, setBox] = useState<MailBox>('inbox')
  const [filter, setFilter] = useState<MailFilter>('all')
  const [latest, setLatest] = useState<LatestMailItem[]>([])

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const loadLatest = async () => {
    if (accounts.length === 0) {
      setLatest([])
      return
    }
    setLatestLoading(true)
    try {
      setLatest(await api.mailLatest())
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Checker error')
    } finally {
      setLatestLoading(false)
    }
  }

  const loadMail = async (id: string, nextBox = box, nextFilter = filter) => {
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const list = await api.mail(id, { box: nextBox, filter: nextFilter, limit: 30 })
      setMessages(list)
    } catch (err) {
      setMessages([])
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLatest().catch(() => undefined)
  }, [accounts.length])

  useEffect(() => {
    if (accountId) loadMail(accountId, box, filter)
  }, [accountId, box, filter])

  const openMsg = async (uid: number, mailbox?: string, forAccountId?: string) => {
    const id = forAccountId || accountId
    if (!id) return
    if (forAccountId) setAccountId(forAccountId)

    const preview = messages.find((m) => m.uid === uid)
    setSelected({
      uid,
      subject: preview?.subject || 'Loading…',
      from: preview?.from || '',
      to: '',
      date: preview?.date || new Date().toISOString(),
      seen: preview?.seen ?? true,
      snippet: preview?.snippet || '',
      mailbox: mailbox || preview?.mailbox || 'INBOX',
      text: '',
      html: '',
    })
    setDetailLoading(true)
    try {
      const msg = await api.message(id, uid, mailbox || preview?.mailbox)
      setSelected(msg)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error')
    } finally {
      setDetailLoading(false)
    }
  }

  const removeAccount = async (id: string) => {
    if (!confirm('Remove this mail account from Locket?')) return
    await api.deleteAccount(id)
    if (accountId === id) setAccountId(null)
    await onRefresh()
    toast('Account removed')
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Mail</h2>
          <p className="sub">
            Multiple mailboxes · quick checker · spam-aware filters
          </p>
        </div>
        <div className="toolbar">
          <button className="ghost-btn" onClick={() => loadLatest()} disabled={latestLoading}>
            {latestLoading ? 'Checking…' : 'Latest mail checker'}
          </button>
          {accountId && (
            <button
              className="ghost-btn"
              onClick={() => loadMail(accountId)}
              disabled={loading}
            >
              Refresh
            </button>
          )}
          <button className="primary-btn" onClick={() => setShowAdd(true)}>
            + Mailbox
          </button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="latest-strip">
          {latest.length === 0 && !latestLoading ? (
            <div className="latest-card muted">Click “Latest mail checker”</div>
          ) : (
            latest.map((item) => (
              <button
                key={item.accountId}
                className="latest-card"
                onClick={() => {
                  setAccountId(item.accountId)
                  if (item.uid) openMsg(item.uid, item.mailbox, item.accountId)
                }}
              >
                <div className="latest-acc">{item.accountLabel}</div>
                {item.error ? (
                  <div className="latest-err">{item.error}</div>
                ) : item.empty || !item.subject ? (
                  <div className="meta">No messages</div>
                ) : (
                  <>
                    <div className="latest-subj">{item.subject}</div>
                    <div className="meta">{item.from}</div>
                    <div className="meta">
                      {item.date ? new Date(item.date).toLocaleString('en-US') : ''}
                    </div>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <strong>No mailboxes</strong>
            Add as many Gmail / Yandex / Mail.ru accounts as you like — each is stored separately in the vault.
          </div>
        </div>
      ) : (
        <div className="mail-layout">
          <div className="account-list">
            <div className="meta" style={{ padding: '0 4px 6px', fontWeight: 700 }}>
              Mailboxes ({accounts.length})
            </div>
            {accounts.map((a) => (
              <button
                key={a.id}
                className={`account-chip ${accountId === a.id ? 'active' : ''}`}
                onClick={() => setAccountId(a.id)}
              >
                <div style={{ fontWeight: 700 }}>{a.label}</div>
                <div className="email">{a.email}</div>
              </button>
            ))}
            <button className="ghost-btn" onClick={() => setShowAdd(true)}>
              Add mailbox
            </button>
            {accountId && (
              <button className="danger-btn" onClick={() => removeAccount(accountId)}>
                Remove mailbox
              </button>
            )}
          </div>

          <div>
            <div className="filters">
              <button className={`chip ${box === 'inbox' ? 'active' : ''}`} onClick={() => setBox('inbox')}>
                Inbox
              </button>
              <button className={`chip ${box === 'all' ? 'active' : ''}`} onClick={() => setBox('all')}>
                All
              </button>
              <button className={`chip ${box === 'spam' ? 'active' : ''}`} onClick={() => setBox('spam')}>
                Spam
              </button>
              <span style={{ width: 8 }} />
              <button
                className={`chip ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All mail
              </button>
              <button
                className={`chip ${filter === 'people' ? 'active' : ''}`}
                onClick={() => setFilter('people')}
              >
                From people
              </button>
              <button
                className={`chip ${filter === 'noreply' ? 'active' : ''}`}
                onClick={() => setFilter('noreply')}
              >
                Newsletters
              </button>
            </div>

            <div className="layout-split">
              <div className="list-pane">
                <div className="list-scroll">
                  {loading && !messages.length ? (
                    <div className="loading">Loading messages…</div>
                  ) : error ? (
                    <div className="empty">
                      <strong>Could not load</strong>
                      {error}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="empty">
                      <strong>Empty</strong>
                      No messages in this folder or filter.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <button
                        key={`${m.mailbox || 'INBOX'}-${m.uid}`}
                        className={`list-item mail-item ${!m.seen ? 'unread' : ''} ${selected?.uid === m.uid ? 'active' : ''}`}
                        onClick={() => openMsg(m.uid, m.mailbox)}
                      >
                        <div className="title-row">
                          <span className="title">{m.subject}</span>
                        </div>
                        <div className="meta">{m.from}</div>
                        <div className="meta">{m.snippet}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="detail-pane">
                {!selected ? (
                  <div className="empty">
                    <strong>Message</strong>
                    Select a message on the left or a checker card above.
                  </div>
                ) : (
                  <>
                    <div className="detail-head">
                      <div>
                        <h3>{selected.subject}</h3>
                        <p className="sub" style={{ marginTop: 6 }}>
                          from {selected.from}
                          <br />
                          {new Date(selected.date).toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>
                    {detailLoading ? (
                      <div className="loading">Opening message…</div>
                    ) : selected.html ? (
                      <div
                        className="mail-body html-frame"
                        dangerouslySetInnerHTML={{ __html: selected.html }}
                      />
                    ) : (
                      <div className="mail-body">{selected.text || 'No text'}</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <AccountModal
          onClose={() => setShowAdd(false)}
          onSave={async () => {
            await onRefresh()
            await loadLatest()
            toast('Mailbox added')
          }}
        />
      )}
    </>
  )
}

export default function App() {
  const [boot, setBoot] = useState<'loading' | 'migrate' | 'app'>('loading')
  const [tab, setTab] = useState<Tab>('vault')
  const [entries, setEntries] = useState<EntryListItem[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const { msg, show, toast } = useToast()

  const refresh = async () => {
    const [e, a] = await Promise.all([api.entries(), api.accounts()])
    setEntries(e)
    setAccounts(a)
  }

  const bootApp = async () => {
    await refresh()
    setBoot('app')
  }

  const openAuto = async () => {
    try {
      const res = await api.bootstrap()
      setToken(res.token)
      await bootApp()
    } catch (err) {
      const code = (err as Error & { code?: string }).code
      const message = err instanceof Error ? err.message : ''
      if (code === 'NEEDS_MIGRATE' || /Legacy vault|master password|old master/i.test(message)) {
        setBoot('migrate')
        return
      }
      toast(message || 'Could not open')
      setBoot('migrate')
    }
  }

  useEffect(() => {
    openAuto().catch(() => undefined)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('desktop-app', isDesktopApp())
  }, [])

  useEffect(() => {
    setAuthLostHandler(() => {
      openAuto().catch(() => undefined)
    })
    return () => setAuthLostHandler(null)
  }, [])

  if (boot === 'loading') {
    return (
      <DesktopShell>
        <div className="gate">
          <div className="loading">Opening Locket…</div>
        </div>
      </DesktopShell>
    )
  }

  if (boot === 'migrate') {
    return (
      <DesktopShell>
        <MigrateGate onDone={bootApp} />
      </DesktopShell>
    )
  }

  return (
    <DesktopShell>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <BrandMark />
            <h1>Locket</h1>
            <p>passwords · mail · 2FA</p>
          </div>
          <nav className="nav">
            <button className={tab === 'vault' ? 'active' : ''} onClick={() => setTab('vault')}>
              Vault
            </button>
            <button className={tab === 'mail' ? 'active' : ''} onClick={() => setTab('mail')}>
              Mail
            </button>
            <button className={tab === 'generator' ? 'active' : ''} onClick={() => setTab('generator')}>
              Generator
            </button>
            <button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>
              Breaches
            </button>
            <button className={tab === 'ssh' ? 'active' : ''} onClick={() => setTab('ssh')}>
              SSH
            </button>
            <button className={tab === 'totp' ? 'active' : ''} onClick={() => setTab('totp')}>
              2FA
            </button>
            <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
              Notes
            </button>
          </nav>
          <div className="sidebar-foot">
            <div className="meta" style={{ padding: '0 4px', opacity: 0.7 }}>
              passwordless sign-in
            </div>
          </div>
        </aside>

        <main className="main">
          {tab === 'vault' && (
            <VaultView entries={entries} accounts={accounts} onRefresh={refresh} toast={toast} />
          )}
          {tab === 'mail' && <MailView accounts={accounts} onRefresh={refresh} toast={toast} />}
          {tab === 'generator' && <GeneratorHeavy toast={toast} />}
          {tab === 'security' && <SecurityView toast={toast} />}
          {tab === 'ssh' && <SshView toast={toast} />}
          {tab === 'totp' && <TotpView toast={toast} />}
          {tab === 'notes' && <NotesView toast={toast} />}
        </main>

        <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>
      </div>
    </DesktopShell>
  )
}
