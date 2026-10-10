import { checkPasswordLeak } from './leaks.js'
import type { VaultEntry } from './types.js'

export type AuditIssue = {
  entryId: string
  title: string
  kind: 'weak' | 'reused' | 'old' | 'empty' | 'breached'
  detail: string
}

function scorePassword(password: string): number {
  let s = 0
  if (password.length >= 8) s++
  if (password.length >= 12) s++
  if (password.length >= 16) s++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++
  if (/\d/.test(password)) s++
  if (/[^a-zA-Z0-9]/.test(password)) s++
  return s
}

export async function auditVault(
  entries: VaultEntry[],
  opts: { checkBreaches?: boolean } = {},
): Promise<{ score: number; issues: AuditIssue[]; checked: number }> {
  const issues: AuditIssue[] = []
  const byPassword = new Map<string, VaultEntry[]>()

  for (const e of entries) {
    if (!e.password) {
      issues.push({ entryId: e.id, title: e.title, kind: 'empty', detail: 'Empty password' })
      continue
    }
    const list = byPassword.get(e.password) || []
    list.push(e)
    byPassword.set(e.password, list)

    if (scorePassword(e.password) <= 2) {
      issues.push({
        entryId: e.id,
        title: e.title,
        kind: 'weak',
        detail: 'Weak or short password',
      })
    }

    const ageMs = Date.now() - new Date(e.updatedAt).getTime()
    if (ageMs > 1000 * 60 * 60 * 24 * 365) {
      issues.push({
        entryId: e.id,
        title: e.title,
        kind: 'old',
        detail: 'Not updated in over a year',
      })
    }
  }

  for (const [, group] of byPassword) {
    if (group.length > 1) {
      for (const e of group) {
        issues.push({
          entryId: e.id,
          title: e.title,
          kind: 'reused',
          detail: `Reused in ${group.length} entries`,
        })
      }
    }
  }

  let checked = 0
  if (opts.checkBreaches) {
    const unique = [...byPassword.keys()].slice(0, 40)
    for (const password of unique) {
      try {
        const result = await checkPasswordLeak(password)
        checked++
        if (result.breached) {
          for (const e of byPassword.get(password) || []) {
            issues.push({
              entryId: e.id,
              title: e.title,
              kind: 'breached',
              detail: `Found in breaches ×${result.count.toLocaleString('en-US')}`,
            })
          }
        }
      } catch {
        /* skip network errors */
      }
    }
  }

  const severity = { breached: 5, reused: 3, weak: 2, empty: 2, old: 1 } as const
  const penalty = issues.reduce((sum, i) => sum + severity[i.kind], 0)
  const score = Math.max(0, Math.min(100, 100 - penalty * 3))

  return { score, issues, checked }
}
