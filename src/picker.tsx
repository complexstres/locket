import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './picker.css'

type Hit = {
  id: string
  title: string
  username: string
  password: string
  url: string
  favorite: boolean
  category?: string
}

type ExtEntry = Hit & {
  totp?: { id: string; label: string; issuer: string; code: string; remaining: number }[]
}

async function bootstrapToken(): Promise<string> {
  const cached = localStorage.getItem('locket_token') || ''
  if (cached) return cached
  const res = await fetch('/api/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const data = (await res.json()) as { token?: string }
  if (data.token) localStorage.setItem('locket_token', data.token)
  return data.token || ''
}

async function api<T>(path: string): Promise<T> {
  const token = await bootstrapToken()
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (res.status === 401) {
    localStorage.removeItem('locket_token')
    const again = await bootstrapToken()
    const retry = await fetch(path, {
      headers: { Authorization: `Bearer ${again}`, 'Content-Type': 'application/json' },
    })
    if (!retry.ok) throw new Error('Authentication required')
    return retry.json() as Promise<T>
  }
  if (!res.ok) throw new Error('API error')
  return res.json() as Promise<T>
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
}

function PickerApp() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Hit[]>([])
  const [active, setActive] = useState(0)
  const [toast, setToast] = useState('')
  const [detail, setDetail] = useState<ExtEntry | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      api<Hit[]>(`/api/ext/search?q=${encodeURIComponent(q)}`)
        .then((list) => {
          if (!cancelled) {
            setItems(list)
            setActive(0)
            setDetail(null)
          }
        })
        .catch(() => {
          if (!cancelled) setItems([])
        })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  const current = items[active] || null

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 1200)
  }

  const doCopy = async (kind: 'password' | 'user' | 'both' | 'totp') => {
    if (!current) return
    if (kind === 'user') {
      await copy(current.username)
      flash('Username copied')
      return
    }
    if (kind === 'password') {
      await copy(current.password)
      flash('Password copied')
      return
    }
    if (kind === 'both') {
      await copy(current.username)
      flash('Username…')
      window.setTimeout(async () => {
        await copy(current.password)
        flash('Password copied')
      }, 700)
      return
    }
    if (kind === 'totp') {
      const full = detail || (await api<ExtEntry>(`/api/ext/entry/${current.id}`))
      setDetail(full)
      const code = full.totp?.[0]?.code
      if (!code) {
        flash('No 2FA')
        return
      }
      await copy(code)
      flash('2FA copied')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(items.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        doCopy('password')
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        doCopy('both')
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        doCopy('user')
      } else if (e.key === 't' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        doCopy('totp')
      } else if (e.key === 'Escape') {
        window.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, active, current, detail])

  const hint = useMemo(
    () => '↑↓ · Enter password · Shift+Enter username · Ctrl+Enter both · Ctrl+T 2FA · Esc',
    [],
  )

  return (
    <div className="picker">
      <input
        ref={inputRef}
        className="picker-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search vault…"
      />
      <div className="picker-hint">{hint}</div>
      <div className="picker-list">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className={`picker-item ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => doCopy('password')}
          >
            <strong>
              {item.favorite ? '★ ' : ''}
              {item.title}
            </strong>
            <span>{item.username || item.url || '—'}</span>
          </button>
        ))}
        {items.length === 0 && <div className="picker-empty">Nothing found</div>}
      </div>
      {toast && <div className="picker-toast">{toast}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PickerApp />
  </StrictMode>,
)
