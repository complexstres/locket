function findFields(root = document) {
  const passwords = [...root.querySelectorAll('input[type="password"]')].filter(visible)
  if (!passwords.length) return null
  const pass = passwords[0]
  const form = pass.closest('form') || document.body
  const candidates = [
    ...form.querySelectorAll(
      'input[type="email"], input[type="text"], input[type="tel"], input:not([type])',
    ),
  ].filter((el) => visible(el) && el !== pass)
  const user =
    candidates.find((el) => /user|login|email|mail|phone|account|логин/i.test(`${el.name} ${el.id} ${el.autocomplete} ${el.placeholder}`)) ||
    candidates[0] ||
    null
  return { user, pass, form }
}

function visible(el) {
  if (!el || el.disabled || el.readOnly) return false
  const r = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function fill(userEl, passEl, username, password) {
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
  set(userEl, username || '')
  set(passEl, password || '')
}

function ensureBtn() {
  if (document.getElementById('locket-fill-btn')) return
  const fields = findFields()
  if (!fields) return
  const btn = document.createElement('button')
  btn.id = 'locket-fill-btn'
  btn.type = 'button'
  btn.textContent = 'Locket'
  btn.title = 'Fill from Locket'
  Object.assign(btn.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483646',
    border: '0',
    borderRadius: '10px',
    padding: '10px 14px',
    background: '#18181b',
    color: '#f4f4f5',
    font: '600 13px/1 Figtree, system-ui, sans-serif',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    cursor: 'pointer',
  })
  btn.addEventListener('click', async () => {
    btn.textContent = '…'
    try {
      const host = location.hostname.replace(/^www\./, '')
      const res = await chrome.runtime.sendMessage({ type: 'MATCH', host })
      if (!res?.ok) throw new Error(res?.error || 'No response')
      const list = res.list || []
      if (!list.length) {
        btn.textContent = 'Empty'
        setTimeout(() => (btn.textContent = 'Locket'), 1500)
        return
      }
      let pick = list[0]
      if (list.length > 1) {
        const labels = list.map((x, i) => `${i + 1}. ${x.title} (${x.username || '—'})`).join('\n')
        const n = Number(prompt(`Multiple accounts:\n${labels}\n\nNumber:`, '1'))
        if (n >= 1 && n <= list.length) pick = list[n - 1]
      }
      const f = findFields() || fields
      fill(f.user, f.pass, pick.username, pick.password)
      btn.textContent = 'OK'
      setTimeout(() => (btn.textContent = 'Locket'), 1200)
    } catch (e) {
      btn.textContent = '!'
      btn.title = e instanceof Error ? e.message : 'Error'
      setTimeout(() => (btn.textContent = 'Locket'), 2000)
    }
  })
  document.documentElement.appendChild(btn)
}

ensureBtn()
const mo = new MutationObserver(() => ensureBtn())
mo.observe(document.documentElement, { childList: true, subtree: true })
