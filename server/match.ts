import { detectBrand } from '../src/brands.ts'
import type { TotpEntry, VaultEntry } from './types.js'
import { generateTotp } from './totp.js'

function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export function siteRoot(host: string): string {
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host
  const two = parts.slice(-2).join('.')
  if (['co.uk', 'com.au', 'com.br', 'co.jp'].includes(two)) {
    return parts.slice(-3).join('.')
  }
  return two
}

export function entrySiteMeta(e: Pick<VaultEntry, 'title' | 'url'>) {
  const brand = detectBrand(e.title, e.url)
  if (brand) {
    return { key: `brand:${brand.id}`, label: brand.name, domain: brand.domain, brandId: brand.id }
  }
  const host = hostFromUrl(e.url || '')
  if (host) {
    const root = siteRoot(host)
    return { key: `host:${root}`, label: root, domain: root }
  }
  const title = (e.title || 'No site').trim()
  return { key: `title:${title.toLowerCase()}`, label: title, domain: '' }
}

export function hostMatchesEntry(host: string, e: Pick<VaultEntry, 'title' | 'url'>): number {
  const h = host.replace(/^www\./, '').toLowerCase()
  const root = siteRoot(h)
  const meta = entrySiteMeta(e)
  let score = 0
  if (meta.domain && (h === meta.domain || h.endsWith(`.${meta.domain}`) || meta.domain.endsWith(h))) score += 100
  if (meta.domain && root === siteRoot(meta.domain)) score += 80
  const brand = detectBrand(e.title, e.url)
  if (brand && (h === brand.domain || h.endsWith(`.${brand.domain}`))) score += 90
  if (e.title && h.includes(e.title.toLowerCase().replace(/\s+/g, ''))) score += 20
  const eh = hostFromUrl(e.url || '')
  if (eh && (h === eh || h.endsWith(`.${siteRoot(eh)}`) || siteRoot(eh) === root)) score += 70
  return score
}

export function totpMatchScore(
  totp: TotpEntry,
  site: { label: string; domain: string; brandId?: string },
  entry?: Pick<VaultEntry, 'title' | 'url' | 'username'>,
): number {
  const hay = `${totp.issuer} ${totp.label}`.toLowerCase()
  const issuer = (totp.issuer || '').toLowerCase()
  const label = (totp.label || '').toLowerCase()
  let score = 0
  if (site.domain) {
    const stem = site.domain.replace(/\.[a-z]+$/, '').toLowerCase()
    if (issuer === stem || issuer === site.domain.toLowerCase()) score += 100
    else if (hay.includes(stem)) score += 60
  }
  if (site.label) {
    const l = site.label.toLowerCase()
    if (issuer === l) score += 90
    else if (hay.includes(l)) score += 50
  }
  if (entry) {
    const brand = detectBrand(entry.title, entry.url, totp.issuer)
    if (brand && site.brandId && brand.id === site.brandId) score += 80
    const user = (entry.username || '').toLowerCase()
    if (user && (label.includes(user) || hay.includes(user))) score += 70
    const title = (entry.title || '').toLowerCase()
    if (title && hay.includes(title)) score += 40
  }
  return score
}

export function matchesTotp(
  totp: TotpEntry,
  site: { label: string; domain: string; brandId?: string },
  entry?: Pick<VaultEntry, 'title' | 'url' | 'username'>,
): boolean {
  return totpMatchScore(totp, site, entry) >= 50
}

/** Best-matching TOTP for a site hub card (avoid dumping the whole vault). */
export function linkedTotpForSite(
  totp: TotpEntry[],
  site: { label: string; domain: string; brandId?: string },
  entry?: Pick<VaultEntry, 'title' | 'url' | 'username'>,
  limit = 6,
) {
  return totp
    .map((t) => ({ t, score: totpMatchScore(t, site, entry) }))
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => t)
}

export function liveTotp(t: TotpEntry) {
  const { code, remaining, period } = generateTotp(t.secret, {
    digits: t.digits,
    period: t.period,
    algorithm: t.algorithm,
  })
  return {
    id: t.id,
    label: t.label,
    issuer: t.issuer,
    code,
    remaining,
    period,
  }
}

export function searchEntries(entries: VaultEntry[], q: string, limit = 40) {
  const needle = q.trim().toLowerCase()
  const scored = entries
    .map((e) => {
      const hay = `${e.title} ${e.username} ${e.url} ${e.notes} ${e.category}`.toLowerCase()
      let score = 0
      if (!needle) score = e.favorite ? 2 : 1
      else if (hay.includes(needle)) {
        score = 10
        if (e.title.toLowerCase().startsWith(needle)) score += 5
        if (e.favorite) score += 2
      }
      return { e, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title, 'ru'))
    .slice(0, limit)
  return scored.map(({ e }) => e)
}
