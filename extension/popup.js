import { matchHost, search, getToken } from './api.js'

const listEl = document.getElementById('list')
const errEl = document.getElementById('err')
const hostEl = document.getElementById('host')
const qEl = document.getElementById('q')

async function activeHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  try {
    return { tab, host: new URL(tab.url).hostname.replace(/^www\./, '') }
  } catch {
    return { tab, host: '' }
  }
}

function render(items) {
  listEl.innerHTML = ''
  if (!items.length) {
    listEl.innerHTML = '<div class="err">Nothing found</div>'
    return
  }
  for (const item of items) {
    const btn = document.createElement('button')
    btn.className = 'item'
    btn.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.username || item.url || '—')}</span>`
    btn.addEventListener('click', async () => {
      const { tab } = await activeHost()
      if (!tab?.id) return
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (username, password) => {
          const pass = document.querySelector('input[type="password"]')
          if (!pass) return false
          const form = pass.closest('form') || document.body
          const user =
            form.querySelector('input[type="email"], input[type="text"], input[autocomplete="username"]') ||
            form.querySelector('input:not([type="password"]):not([type="hidden"])')
          const set = (el, value) => {
            if (!el) return
            el.focus()
            const proto = Object.getPrototypeOf(el)
            const desc = Object.getOwnPropertyDescriptor(proto, 'value')
            if (desc?.set) desc.set.call(el, value)
            else el.value = value
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
          set(user, username)
          set(pass, password)
          return true
        },
        args: [item.username || '', item.password || ''],
      })
      window.close()
    })
    listEl.appendChild(btn)
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function load(q = '') {
  errEl.hidden = true
  try {
    if (!(await getToken())) {
      errEl.hidden = false
      errEl.textContent = 'Paste the token in extension settings first'
      return
    }
    const { host } = await activeHost()
    hostEl.textContent = host || 'no tab'
    const items = q.trim() ? await search(q) : host ? await matchHost(host) : await search('')
    render(items)
  } catch (e) {
    errEl.hidden = false
    errEl.textContent = e instanceof Error ? e.message : 'API error — is Locket running?'
  }
}

qEl.addEventListener('input', () => load(qEl.value))
load()
