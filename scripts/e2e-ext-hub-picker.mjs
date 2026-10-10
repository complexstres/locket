#!/usr/bin/env node
/**
 * Smoke tests: extension API, site hub, picker static assets.
 * Requires API on 127.0.0.1:3847
 */
const BASE = process.env.LOCKET_URL || 'http://127.0.0.1:3847'
const results = []

function ok(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 160) })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function req(method, path, { body, headers, expect } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (expect !== undefined) ok(`${method} ${path} → ${expect}`, res.status === expect, `got ${res.status}`)
  return { status: res.status, data, text }
}

async function main() {
  const status = await req('GET', '/api/status')
  ok('status initialized', status.data?.initialized === true, JSON.stringify(status.data))

  const boot = await req('POST', '/api/bootstrap', { body: {} })
  const token = boot.data?.token
  ok('bootstrap token', Boolean(token && token.length >= 32), `len=${token?.length || 0}`)
  const AUTH = { Authorization: `Bearer ${token}` }

  const status2 = await req('GET', '/api/status')
  ok('status unlocked', status2.data?.unlocked === true, JSON.stringify(status2.data))

  const entries = await req('GET', '/api/entries', { headers: AUTH })
  ok('entries list', Array.isArray(entries.data), `n=${entries.data?.length ?? '?'}`)

  let hubEntry = (entries.data || []).find((e) => e.title === 'E2E GitHub Hub')
  if (!hubEntry) {
    const created = await req('POST', '/api/entries', {
      headers: AUTH,
      body: {
        title: 'E2E GitHub Hub',
        username: 'e2e-user',
        password: 'E2ePass!23456',
        url: 'https://github.com/login',
        category: 'Test',
        notes: 'e2e hub',
        favorite: true,
      },
    })
    hubEntry = created.data
    ok('seed hub entry', Boolean(hubEntry?.id), hubEntry?.id)
  } else {
    ok('seed hub entry exists', true, hubEntry.id)
  }

  if (!(entries.data || []).some((e) => e.title === 'E2E GitHub Work')) {
    const work = await req('POST', '/api/entries', {
      headers: AUTH,
      body: {
        title: 'E2E GitHub Work',
        username: 'work@example.com',
        password: 'WorkPass!23456',
        url: 'https://github.com',
        category: 'Test',
        favorite: false,
      },
    })
    ok('seed work entry', Boolean(work.data?.id), work.data?.id)
  } else {
    ok('seed work entry exists', true)
  }

  const totpList = await req('GET', '/api/totp', { headers: AUTH })
  const hasGhTotp = (totpList.data || []).some(
    (t) => /github/i.test(`${t.issuer} ${t.label}`),
  )
  if (!hasGhTotp) {
    const t = await req('POST', '/api/totp', {
      headers: AUTH,
      body: {
        label: 'e2e-user',
        issuer: 'GitHub',
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
      },
    })
    ok('seed totp', t.status === 200 || t.status === 201 || Boolean(t.data), String(t.status))
  } else {
    ok('seed totp exists', true)
  }

  const ext = await req('POST', '/api/ext/enable', { headers: AUTH, body: {} })
  const extToken = ext.data?.token
  ok('ext enable', Boolean(extToken && extToken.length >= 32), `len=${extToken?.length}`)

  const st = await req('GET', '/api/ext/status', { headers: AUTH })
  ok('ext status', st.data?.enabled === true)

  await req('GET', '/api/ext/match?host=github.com', { expect: 401 })
  await req('GET', '/api/ext/match?host=github.com', {
    headers: { 'X-Locket-Ext': 'bad' },
    expect: 401,
  })

  const matched = await req('GET', '/api/ext/match?host=github.com', {
    headers: { 'X-Locket-Ext': extToken },
  })
  ok('ext match github', Array.isArray(matched.data) && matched.data.length > 0, `n=${matched.data?.length}`)
  ok('ext match score', (matched.data?.[0]?.score || 0) >= 70, `score=${matched.data?.[0]?.score}`)

  const www = await req('GET', '/api/ext/match?host=www.github.com', {
    headers: { 'X-Locket-Ext': extToken },
  })
  ok('ext match www', Array.isArray(www.data) && www.data.length > 0, `n=${www.data?.length}`)

  const search = await req('GET', '/api/ext/search?q=E2E', {
    headers: { 'X-Locket-Ext': extToken },
  })
  ok('ext search', Array.isArray(search.data) && search.data.length >= 1, `n=${search.data?.length}`)

  const empty = await req('GET', '/api/ext/search?q=', {
    headers: { 'X-Locket-Ext': extToken },
  })
  ok('ext search empty', Array.isArray(empty.data) && empty.data.length >= 1, `n=${empty.data?.length}`)

  const eid = matched.data?.[0]?.id || hubEntry.id
  const detail = await req('GET', `/api/ext/entry/${eid}`, {
    headers: { 'X-Locket-Ext': extToken },
  })
  ok('ext entry password', Boolean(detail.data?.password))
  const codes = (detail.data?.totp || []).map((t) => t.code)
  ok(
    'ext entry totp',
    Array.isArray(detail.data?.totp) && codes.some((c) => /^\d{6}$/.test(c)),
    `codes=${codes.join(',')}`,
  )

  const hub = await req('GET', `/api/hub?entryId=${eid}`, { headers: AUTH })
  ok(
    'hub card',
    hub.data?.accounts?.length >= 1 && Array.isArray(hub.data?.totp) && Array.isArray(hub.data?.mailAccounts),
    `site=${hub.data?.site?.label} acc=${hub.data?.accounts?.length} totp=${hub.data?.totp?.length}`,
  )
  ok('hub multi accounts', (hub.data?.accounts?.length || 0) >= 2, `n=${hub.data?.accounts?.length}`)

  const hubHost = await req('GET', '/api/hub?host=github.com', {
    headers: { 'X-Locket-Ext': extToken },
  })
  ok('hub by host+ext', (hubHost.data?.accounts?.length || 0) >= 1)

  const rot = await req('POST', '/api/ext/rotate', { headers: AUTH, body: {} })
  const newTok = rot.data?.token
  ok('ext rotate', Boolean(newTok && newTok !== extToken))
  await req('GET', '/api/ext/match?host=github.com', {
    headers: { 'X-Locket-Ext': extToken },
    expect: 401,
  })
  const rematch = await req('GET', '/api/ext/match?host=github.com', {
    headers: { 'X-Locket-Ext': newTok },
  })
  ok('ext after rotate', Array.isArray(rematch.data) && rematch.data.length > 0)

  const picker = await fetch(`${BASE}/picker.html`)
  const pickerHtml = await picker.text()
  ok('picker.html', picker.ok && /picker/i.test(pickerHtml))
  const jsMatch = pickerHtml.match(/src="(\/assets\/picker-[^"]+\.js)"/)
  if (jsMatch) {
    const js = await fetch(`${BASE}${jsMatch[1]}`)
    ok('picker bundle', js.ok, jsMatch[1])
  } else {
    ok('picker bundle', false, 'no script tag')
  }

  const index = await fetch(`${BASE}/`)
  const indexHtml = await index.text()
  ok('index.html', index.ok)
  const cssMatch = indexHtml.match(/href="(\/assets\/main-[^"]+\.css)"/)
  if (cssMatch) {
    const css = await (await fetch(`${BASE}${cssMatch[1]}`)).text()
    ok('css browser-bar', css.includes('.browser-bar'))
    ok('css site-hub', css.includes('.site-hub'))
  } else {
    ok('css browser-bar', false)
    ok('css site-hub', false)
  }

  const { readFileSync, existsSync } = await import('node:fs')
  const files = [
    'extension/manifest.json',
    'extension/background.js',
    'extension/content.js',
    'extension/api.js',
    'extension/popup.html',
    'extension/popup.js',
    'extension/options.html',
    'extension/options.js',
    'extension/icons/16.png',
    'extension/icons/48.png',
    'extension/icons/128.png',
    'src/picker.tsx',
    'electron/main.cjs',
  ]
  ok(
    'extension+picker files',
    files.every((f) => existsSync(f)),
    files.filter((f) => !existsSync(f)).join(',') || 'all',
  )

  const man = JSON.parse(readFileSync('extension/manifest.json', 'utf8'))
  ok('manifest MV3', man.manifest_version === 3 && man.host_permissions.some((p) => p.includes('3847')))

  const content = readFileSync('extension/content.js', 'utf8')
  ok(
    'content fill button',
    content.includes('locket-fill-btn') && content.includes('MATCH') && content.includes('findFields'),
  )

  const pickerSrc = readFileSync('src/picker.tsx', 'utf8')
  ok(
    'picker hotkeys',
    pickerSrc.includes('ArrowDown') && pickerSrc.includes('totp') && pickerSrc.includes('Escape'),
  )

  const electron = readFileSync('electron/main.cjs', 'utf8')
  ok(
    'electron hotkey+picker',
    electron.includes('globalShortcut') &&
      electron.includes('CommandOrControl+Shift+Space') &&
      electron.includes('togglePicker') &&
      electron.includes('picker.html'),
  )

  const failed = results.filter((r) => !r.pass)
  console.log(`\nTOTAL ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('Failed:', failed.map((f) => f.name).join(', '))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
