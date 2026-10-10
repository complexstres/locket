import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, type Account, type Entry, type EntryListItem, type SiteHub, type TotpLive } from '../api'
import { BrandIcon } from '../BrandIcon'
import { loadCategories, saveCategory } from '../categories'
import { detectBrand } from '../brands'
import { copyLoginThenPassword, copySecure } from '../clipboardSecure'
import { entrySiteKey, groupEntriesBySite, matchesTotpSite } from '../siteGroup'

function strengthScore(password: string) {
  let s = 0
  if (password.length >= 8) s += 1
  if (password.length >= 12) s += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s += 1
  if (/\d/.test(password)) s += 1
  if (/[^a-zA-Z0-9]/.test(password)) s += 1
  return s
}

function strengthMeta(score: number) {
  if (score <= 1) return { label: 'Weak', color: 'var(--danger)', width: '20%' }
  if (score === 2) return { label: 'Fair', color: 'var(--warn)', width: '45%' }
  if (score === 3) return { label: 'Good', color: '#6a9a45', width: '70%' }
  return { label: 'Excellent', color: 'var(--ok)', width: '100%' }
}

function daysAgo(iso: string) {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function EntryModal({
  initial,
  accounts,
  categories,
  onClose,
  onSave,
  onCategoriesChange,
}: {
  initial?: Partial<Entry>
  accounts: Account[]
  categories: string[]
  onClose: () => void
  onSave: (data: Partial<Entry>) => Promise<void>
  onCategoriesChange: () => void
}) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    username: initial?.username || '',
    password: initial?.password || '',
    url: initial?.url || '',
    notes: initial?.notes || '',
    category: initial?.category || 'General',
    favorite: initial?.favorite || false,
    emailAccountId: initial?.emailAccountId || '',
  })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newCat, setNewCat] = useState('')
  const score = strengthScore(form.password)
  const meta = strengthMeta(score)
  const brand = detectBrand(form.title, form.url)

  useEffect(() => {
    if (!form.url && brand) {
      setForm((f) => ({ ...f, url: `https://${brand.domain}` }))
    }
  }, [brand?.id])

  const gen = async () => {
    const { password } = await api.generate({
      mode: 'heavy',
      length: 20,
      upper: true,
      lower: true,
      digits: true,
      symbols: true,
      ambiguous: true,
    })
    setForm((f) => ({ ...f, password }))
  }

  const addCategory = () => {
    const name = newCat.trim()
    if (!name) return
    saveCategory(name)
    setForm((f) => ({ ...f, category: name }))
    setNewCat('')
    onCategoriesChange()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      saveCategory(form.category)
      onCategoriesChange()
      await onSave({
        ...form,
        emailAccountId: form.emailAccountId || undefined,
      })
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
        <h3>{initial?.id ? 'Edit' : 'New entry'}</h3>
        <form onSubmit={submit} className="field-grid">
          <div className="field">
            <label>Title</label>
            <div className="entry-title-row">
              <BrandIcon title={form.title} url={form.url} size={36} />
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="GitHub, Netflix…"
                required
                style={{ flex: 1 }}
              />
            </div>
            {brand && <span className="meta">Logo: {brand.name}</span>}
          </div>
          <div className="field">
            <label>Username / email</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="you@mail.com"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <div className="secret-row">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button type="button" className="icon-btn" onClick={() => setShowPass((v) => !v)}>
                {showPass ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="icon-btn" onClick={gen}>
                Generate
              </button>
            </div>
            {form.password && (
              <>
                <div className="strength">
                  <span style={{ width: meta.width, background: meta.color }} />
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>{meta.label}</span>
              </>
            )}
          </div>
          <div className="field">
            <label>Website</label>
            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {!categories.includes(form.category) && form.category && (
                <option value={form.category}>{form.category}</option>
              )}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="cat-row">
              <input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCategory()
                  }
                }}
                placeholder="Custom category…"
              />
              <button type="button" className="icon-btn" onClick={addCategory} disabled={!newCat.trim()}>
                + Create
              </button>
            </div>
          </div>
          <div className="field">
            <label>Linked mailbox</label>
            <select
              value={form.emailAccountId}
              onChange={(e) => setForm({ ...form, emailAccountId: e.target.value })}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Recovery codes, hints…"
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => setForm({ ...form, favorite: e.target.checked })}
            />
            Add to favorites
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function VaultView({
  entries,
  accounts,
  onRefresh,
  toast,
}: {
  entries: EntryListItem[]
  accounts: Account[]
  onRefresh: () => Promise<void>
  toast: (t: string) => void
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'fav' | 'warn'>('all')
  const [view, setView] = useState<'site' | 'flat'>('site')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Entry | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [modal, setModal] = useState<'new' | 'edit' | null>(null)
  const [prefill, setPrefill] = useState<Partial<Entry> | undefined>()
  const [cat, setCat] = useState('All')
  const [catTick, setCatTick] = useState(0)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [insights, setInsights] = useState<{ reused: string[]; stale: string[]; weak: string[] }>({
    reused: [],
    stale: [],
    weak: [],
  })
  const [totp, setTotp] = useState<TotpLive[]>([])
  const [hub, setHub] = useState<SiteHub | null>(null)
  const [extToken, setExtToken] = useState<string | null>(null)
  const [extEnabled, setExtEnabled] = useState(false)

  const allCategories = useMemo(
    () => loadCategories(entries.map((e) => e.category || 'General')),
    [entries, catTick],
  )
  const categories = useMemo(() => ['All', ...allCategories], [allCategories])

  const warnSet = useMemo(
    () => new Set([...insights.reused, ...insights.stale, ...insights.weak]),
    [insights],
  )

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter === 'fav' && !e.favorite) return false
      if (filter === 'warn' && !warnSet.has(e.id)) return false
      if (cat !== 'All' && e.category !== cat) return false
      const hay = `${e.title} ${e.username} ${e.url} ${e.notes} ${e.category}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [entries, q, filter, cat, warnSet])

  const groups = useMemo(() => groupEntriesBySite(filtered), [filtered])
  const multiSites = useMemo(() => groups.filter((g) => g.entries.length > 1).length, [groups])

  useEffect(() => {
    api.entryInsights().then(setInsights).catch(() => undefined)
    api.totp().then(setTotp).catch(() => undefined)
    api.extStatus()
      .then((s) => {
        setExtEnabled(s.enabled)
        setExtToken(s.token)
      })
      .catch(() => undefined)
    const id = window.setInterval(() => {
      api.totp().then(setTotp).catch(() => undefined)
      if (selectedId) {
        api.hub({ entryId: selectedId }).then(setHub).catch(() => undefined)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [entries, selectedId])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setHub(null)
      return
    }
    let cancelled = false
    api.entry(selectedId).then((e) => {
      if (!cancelled) {
        setDetail(e)
        setShowPass(false)
      }
    })
    api.hub({ entryId: selectedId })
      .then((h) => {
        if (!cancelled) setHub(h)
      })
      .catch(() => {
        if (!cancelled) setHub(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, entries])

  // auto-hide revealed password
  useEffect(() => {
    if (!showPass) return
    const t = window.setTimeout(() => setShowPass(false), 12_000)
    return () => window.clearTimeout(t)
  }, [showPass, detail?.id])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search')?.focus()
      }
      if ((e.key === 'c' || e.key === 'с') && detail?.password) {
        e.preventDefault()
        copySecure(detail.password, toast, 'Password copied').catch(() => undefined)
      }
      if ((e.key === 'l' || e.key === 'д') && detail?.username) {
        e.preventDefault()
        copySecure(detail.username, toast, 'Username copied', 8_000).catch(() => undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, toast])

  const siteOf = detail ? entrySiteKey(detail) : null
  const linkedTotp = useMemo(() => {
    if (!detail || !siteOf) return []
    return totp.filter((t) => matchesTotpSite(t, siteOf, detail)).slice(0, 3)
  }, [totp, detail, siteOf])

  const toggleFav = async () => {
    if (!detail) return
    await api.updateEntry(detail.id, { favorite: !detail.favorite })
    await onRefresh()
    toast(detail.favorite ? 'Removed from favorites' : 'Added to favorites')
  }

  const remove = async () => {
    if (!detail) return
    if (!confirm(`Delete “${detail.title}”?`)) return
    await api.deleteEntry(detail.id)
    setSelectedId(null)
    await onRefresh()
    toast('Deleted')
  }

  const openSite = () => {
    if (!detail?.url) return
    const href = detail.url.startsWith('http') ? detail.url : `https://${detail.url}`
    window.open(href, '_blank', 'noreferrer')
  }

  const flagsFor = (id: string) => {
    const flags: string[] = []
    if (insights.reused.includes(id)) flags.push('reuse')
    if (insights.weak.includes(id)) flags.push('weak')
    if (insights.stale.includes(id)) flags.push('stale')
    return flags
  }

  const renderItem = (e: EntryListItem) => {
    const flags = flagsFor(e.id)
    return (
      <button
        key={e.id}
        className={`list-item ${selectedId === e.id ? 'active' : ''}`}
        onClick={() => setSelectedId(e.id)}
      >
        <div className="title-row">
          <span className="title entry-title-row">
            <BrandIcon title={e.title} url={e.url} size={22} />
            <span>
              {e.favorite ? <span className="star">★ </span> : null}
              {e.title}
            </span>
          </span>
          <span className="badge-row">
            {flags.includes('reuse') && <span className="badge warn-badge">reuse</span>}
            {flags.includes('weak') && <span className="badge warn-badge">weak</span>}
            {flags.includes('stale') && <span className="badge dim-badge">old</span>}
            <span className="badge">{e.category}</span>
          </span>
        </div>
        <div className="meta">{e.username || e.url || '—'}</div>
      </button>
    )
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Vault</h2>
          <p className="sub">
            {entries.length} entries · {groups.length} sites
            {multiSites ? ` · ${multiSites} with multiple accounts` : ''}
            {' · '}
            <span title="Global search">Ctrl+Shift+Space</span>
          </p>
        </div>
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search…  (/)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="primary-btn" onClick={() => { setPrefill(undefined); setModal('new') }}>
            Add
          </button>
        </div>
      </div>

      <div className="browser-bar panel pad">
        <div>
          <strong>Browser + hotkey</strong>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Extension: Chrome → <code>chrome://extensions</code> → Developer mode → Load
            unpacked → folder <code>extension/</code>. Quick-search hotkey:{' '}
            <code>Ctrl+Shift+Space</code> (or Ctrl+Alt+L).
          </p>
        </div>
        <div className="browser-bar-actions">
          {!extEnabled ? (
            <button
              type="button"
              className="primary-btn"
              onClick={async () => {
                const s = await api.extEnable()
                setExtEnabled(true)
                setExtToken(s.token)
                await navigator.clipboard.writeText(s.token)
                toast('Token copied — paste it in extension settings')
              }}
            >
              Enable autofill
            </button>
          ) : (
            <>
              <button
                type="button"
                className="icon-btn"
                onClick={async () => {
                  if (!extToken) return
                  await navigator.clipboard.writeText(extToken)
                  toast('Token copied')
                }}
              >
                Copy token
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={async () => {
                  const s = await api.extRotate()
                  setExtToken(s.token)
                  await navigator.clipboard.writeText(s.token)
                  toast('New token — update it in the extension')
                }}
              >
                Rotate token
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={async () => {
                  await api.extDisable()
                  setExtEnabled(false)
                  setExtToken(null)
                  toast('Autofill disabled')
                }}
              >
                Disable
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filters">
        <button className={`chip ${view === 'site' ? 'active' : ''}`} onClick={() => setView('site')}>
          By site
        </button>
        <button className={`chip ${view === 'flat' ? 'active' : ''}`} onClick={() => setView('flat')}>
          List
        </button>
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={`chip ${filter === 'fav' ? 'active' : ''}`} onClick={() => setFilter('fav')}>
          Favorites
        </button>
        <button className={`chip ${filter === 'warn' ? 'active' : ''}`} onClick={() => setFilter('warn')}>
          At risk {warnSet.size ? `(${warnSet.size})` : ''}
        </button>
        {categories.map((c) => (
          <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="layout-split">
        <div className="list-pane">
          <div className="list-scroll">
            {filtered.length === 0 ? (
              <div className="empty">
                <strong>Empty</strong>
                Add a password or clear the filter.
              </div>
            ) : view === 'flat' ? (
              filtered.map(renderItem)
            ) : (
              groups.map((g) => {
                const closed = collapsed[g.key]
                return (
                  <div key={g.key} className="site-group">
                    <button
                      type="button"
                      className="site-group-head"
                      onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                    >
                      <span className="entry-title-row">
                        <BrandIcon title={g.label} url={g.domain ? `https://${g.domain}` : ''} size={24} />
                        <span>
                          <strong>{g.label}</strong>
                          <span className="meta">
                            {' '}
                            · {g.entries.length}{' '}
                            {g.entries.length === 1 ? 'account' : g.entries.length < 5 ? 'accounts' : 'accounts'}
                          </span>
                        </span>
                      </span>
                      <span className="site-chevron">{closed ? '▸' : '▾'}</span>
                    </button>
                    {!closed && g.entries.map(renderItem)}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="detail-pane">
          {!detail ? (
            <div className="empty">
              <strong>Select an entry</strong>
              Accounts for the same site are grouped. Shortcuts: <code>/</code> search,{' '}
              <code>C</code> password, <code>L</code> username.
            </div>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <h3 className="entry-title-row">
                    <BrandIcon title={detail.title} url={detail.url} size={36} />
                    <span>
                      {detail.favorite ? <span className="star">★ </span> : null}
                      {detail.title}
                    </span>
                  </h3>
                  <p className="sub" style={{ marginTop: 6 }}>
                    {siteOf?.label}
                    {siteOf?.domain ? ` · ${siteOf.domain}` : ''} · updated{' '}
                    {new Date(detail.updatedAt).toLocaleString('en-US')}
                    {daysAgo(detail.updatedAt) >= 180 ? ' · not changed in a while' : ''}
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="primary-btn"
                    onClick={() => copyLoginThenPassword(detail.username, detail.password, toast)}
                  >
                    Username → password
                  </button>
                  {detail.url && (
                    <button className="icon-btn" onClick={openSite}>
                      Open site
                    </button>
                  )}
                  <button className="icon-btn" onClick={toggleFav}>
                    {detail.favorite ? 'Remove ★' : 'Add to favorites'}
                  </button>
                  <button className="icon-btn" onClick={() => { setPrefill(undefined); setModal('edit') }}>
                    Edit
                  </button>
                  <button className="danger-btn" onClick={remove}>
                    Delete
                  </button>
                </div>
              </div>

              {(flagsFor(detail.id).length > 0 || (hub?.accounts.length || 0) > 1) && (
                <div className="insight-strip">
                  {insights.reused.includes(detail.id) && (
                    <span className="insight-pill bad">Password reused in vault</span>
                  )}
                  {insights.weak.includes(detail.id) && (
                    <span className="insight-pill bad">Weak password</span>
                  )}
                  {insights.stale.includes(detail.id) && (
                    <span className="insight-pill warn">Not updated &gt; 6 mo</span>
                  )}
                  {(hub?.accounts.length || 0) > 1 && (
                    <span className="insight-pill">Hub · {hub!.accounts.length} acct.</span>
                  )}
                </div>
              )}

              {hub && (
                <div className="site-hub">
                  <div className="site-hub-title">
                    Everything for <strong>{hub.site.label}</strong>
                    {hub.site.domain ? <span className="meta"> · {hub.site.domain}</span> : null}
                  </div>
                  <div className="site-hub-grid">
                    <div className="site-hub-col">
                      <div className="linked-totp-label">Accounts</div>
                      <div className="siblings-list">
                        {hub.accounts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={`sibling-chip ${a.id === detail.id ? 'active' : ''}`}
                            onClick={() => setSelectedId(a.id)}
                          >
                            <BrandIcon title={a.title} url={a.url} size={18} />
                            <span>
                              {a.title}
                              <span className="meta"> · {a.username || 'no username'}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ marginTop: 8 }}
                        onClick={() => {
                          setPrefill({
                            title: detail.title,
                            url: detail.url,
                            category: detail.category,
                          })
                          setModal('new')
                        }}
                      >
                        + Another account
                      </button>
                    </div>
                    <div className="site-hub-col">
                      <div className="linked-totp-label">2FA</div>
                      {(hub.totp.length ? hub.totp : linkedTotp).length === 0 ? (
                        <p className="meta">No linked codes</p>
                      ) : (
                        <div className="linked-totp-row">
                          {(hub.totp.length ? hub.totp : linkedTotp).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className="linked-totp-chip"
                              onClick={() =>
                                copySecure(t.code, toast, '2FA code copied', 15_000).catch(
                                  () => undefined,
                                )
                              }
                            >
                              <BrandIcon title={t.label} issuer={t.issuer} size={20} />
                              <span className="linked-code">
                                {t.code.length === 6
                                  ? `${t.code.slice(0, 3)} ${t.code.slice(3)}`
                                  : t.code}
                              </span>
                              <span className="meta">{t.remaining}s</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="site-hub-col">
                      <div className="linked-totp-label">Mail</div>
                      {hub.mailAccounts.length === 0 ? (
                        <p className="meta">No mailbox linked to this entry</p>
                      ) : (
                        <>
                          {hub.mailAccounts.map((m) => (
                            <div key={m.id} className="meta" style={{ marginBottom: 6 }}>
                              {m.label} · {m.email}
                            </div>
                          ))}
                          {hub.latestMail && (
                            <div className="hub-mail">
                              <strong>{hub.latestMail.subject}</strong>
                              <div className="meta">{hub.latestMail.from}</div>
                              <div className="meta">{hub.latestMail.snippet}</div>
                            </div>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ marginTop: 8 }}
                        onClick={async () => {
                          const code = hub.totp[0]?.code
                          await copyLoginThenPassword(detail.username, detail.password, toast)
                          if (code) {
                            window.setTimeout(() => {
                              copySecure(code, toast, '2FA copied', 15_000).catch(() => undefined)
                            }, 1600)
                          }
                          if (detail.url) openSite()
                        }}
                      >
                        Username → password → 2FA → site
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="field-grid">
                <div className="field">
                  <label>Username</label>
                  <div className="secret-row">
                    <input readOnly value={detail.username} />
                    <button
                      className="icon-btn"
                      onClick={() =>
                        copySecure(detail.username, toast, 'Username copied', 8_000).catch(() => undefined)
                      }
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Password</label>
                  <div className="secret-row">
                    <input readOnly type={showPass ? 'text' : 'password'} value={detail.password} />
                    <button className="icon-btn" onClick={() => setShowPass((v) => !v)}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() =>
                        copySecure(detail.password, toast, 'Password copied').catch(() => undefined)
                      }
                    >
                      Copy
                    </button>
                  </div>
                  {(() => {
                    const m = strengthMeta(strengthScore(detail.password))
                    return (
                      <>
                        <div className="strength">
                          <span style={{ width: m.width, background: m.color }} />
                        </div>
                        <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                          {m.label}
                          {showPass ? ' · hides in ~12s' : ''}
                        </span>
                      </>
                    )
                  })()}
                </div>
                {detail.url && (
                  <div className="field">
                    <label>Website</label>
                    <div className="secret-row">
                      <input readOnly value={detail.url} />
                      <button type="button" className="icon-btn" onClick={openSite}>
                        Open
                      </button>
                    </div>
                  </div>
                )}
                {detail.notes && (
                  <div className="field">
                    <label>Notes</label>
                    <textarea readOnly value={detail.notes} />
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>

      {modal && (
        <EntryModal
          initial={
            modal === 'edit' && detail
              ? detail
              : prefill
                ? prefill
                : undefined
          }
          accounts={accounts}
          categories={allCategories}
          onCategoriesChange={() => setCatTick((n) => n + 1)}
          onClose={() => {
            setModal(null)
            setPrefill(undefined)
          }}
          onSave={async (data) => {
            if (modal === 'edit' && detail) {
              await api.updateEntry(detail.id, data)
              toast('Saved')
            } else {
              const created = await api.createEntry(data)
              setSelectedId(created.id)
              toast('Added')
            }
            await onRefresh()
          }}
        />
      )}
    </>
  )
}
