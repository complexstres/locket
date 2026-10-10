const API = 'http://127.0.0.1:3847'

export async function getToken() {
  const { extToken } = await chrome.storage.local.get('extToken')
  return extToken || ''
}

export async function setToken(token) {
  await chrome.storage.local.set({ extToken: token || '' })
}

async function req(path, opts = {}) {
  const token = await getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  if (token) headers['X-Locket-Ext'] = token
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.code = data.code
    throw err
  }
  return data
}

export function matchHost(host) {
  return req(`/api/ext/match?host=${encodeURIComponent(host)}`)
}

export function search(q) {
  return req(`/api/ext/search?q=${encodeURIComponent(q || '')}`)
}

export function entry(id) {
  return req(`/api/ext/entry/${encodeURIComponent(id)}`)
}

export function status() {
  return fetch(`${API}/api/status`).then((r) => r.json())
}
