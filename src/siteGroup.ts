import { detectBrand } from './brands'
import type { EntryListItem } from './api'

export type SiteGroup = {
  key: string
  label: string
  domain: string
  brandId?: string
  entries: EntryListItem[]
}

function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** Registrable-ish root for grouping (github.com, bitcointalk.org). */
export function siteRoot(host: string): string {
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host
  const two = parts.slice(-2).join('.')
  // keep common multi-part TLDs simple
  if (['co.uk', 'com.au', 'com.br', 'co.jp'].includes(two)) {
    return parts.slice(-3).join('.')
  }
  return two
}

export function entrySiteKey(e: Pick<EntryListItem, 'title' | 'url'>): {
  key: string
  label: string
  domain: string
  brandId?: string
} {
  const brand = detectBrand(e.title, e.url)
  if (brand) {
    return {
      key: `brand:${brand.id}`,
      label: brand.name,
      domain: brand.domain,
      brandId: brand.id,
    }
  }
  const host = hostFromUrl(e.url || '')
  if (host) {
    const root = siteRoot(host)
    return { key: `host:${root}`, label: root, domain: root }
  }
  const title = (e.title || 'No site').trim()
  return { key: `title:${title.toLowerCase()}`, label: title, domain: '' }
}

export function groupEntriesBySite(entries: EntryListItem[]): SiteGroup[] {
  const map = new Map<string, SiteGroup>()
  for (const e of entries) {
    const meta = entrySiteKey(e)
    let g = map.get(meta.key)
    if (!g) {
      g = { key: meta.key, label: meta.label, domain: meta.domain, brandId: meta.brandId, entries: [] }
      map.set(meta.key, g)
    }
    g.entries.push(e)
  }
  for (const g of map.values()) {
    g.entries.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return a.title.localeCompare(b.title, 'ru')
    })
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.entries.length !== a.entries.length) return b.entries.length - a.entries.length
    return a.label.localeCompare(b.label, 'ru')
  })
}

export function matchesTotpSite(
  totp: { issuer: string; label: string },
  site: { label: string; domain: string; brandId?: string },
  entry?: Pick<EntryListItem, 'title' | 'url' | 'username'>,
): boolean {
  const hay = `${totp.issuer} ${totp.label}`.toLowerCase()
  if (site.domain && hay.includes(site.domain.replace(/\.[a-z]+$/, ''))) return true
  if (site.label && hay.includes(site.label.toLowerCase())) return true
  if (entry) {
    const brand = detectBrand(entry.title, entry.url, totp.issuer)
    if (brand && site.brandId && brand.id === site.brandId) return true
    if (entry.username && totp.label.toLowerCase().includes(entry.username.toLowerCase())) return true
  }
  return false
}
