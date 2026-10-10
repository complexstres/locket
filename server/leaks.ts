import { createHash } from 'node:crypto'

export type PasswordLeakResult = {
  breached: boolean
  count: number
  source: 'haveibeenpwned'
}

export type EmailLeakResult = {
  email: string
  breached: boolean
  breaches: string[]
  source: string
  hint?: string
}

/** HIBP k-anonymity: only first 5 of SHA-1 leave the machine */
export async function checkPasswordLeak(password: string): Promise<PasswordLeakResult> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'Locket-Local-Vault' },
  })
  if (!res.ok) throw new Error(`HIBP unavailable (${res.status})`)

  const text = await res.text()
  const line = text.split('\n').find((l) => l.startsWith(suffix))
  if (!line) return { breached: false, count: 0, source: 'haveibeenpwned' }
  const count = Number(line.trim().split(':')[1] || 0)
  return { breached: count > 0, count, source: 'haveibeenpwned' }
}

/** Public XposedOrNot API — no key required */
export async function checkEmailLeak(email: string): Promise<EmailLeakResult> {
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) throw new Error('Invalid email')

  try {
    const res = await fetch(
      `https://api.xposedornot.com/v1/check-email/${encodeURIComponent(normalized)}`,
      { headers: { 'User-Agent': 'Locket-Local-Vault' } },
    )

    if (res.status === 404) {
      return { email: normalized, breached: false, breaches: [], source: 'xposedornot' }
    }

    const data = (await res.json()) as {
      Error?: string
      breacheNames?: string[]
      breaches?: string[][] | string[]
    }

    if (data.Error && /not found|no breach/i.test(data.Error)) {
      return { email: normalized, breached: false, breaches: [], source: 'xposedornot' }
    }

    let breaches: string[] = []
    if (Array.isArray(data.breacheNames)) breaches = data.breacheNames
    else if (Array.isArray(data.breaches)) {
      breaches = data.breaches.flat().map(String)
    }

    return {
      email: normalized,
      breached: breaches.length > 0,
      breaches: [...new Set(breaches)],
      source: 'xposedornot',
    }
  } catch (e) {
    // fallback hint if network blocked
    return {
      email: normalized,
      breached: false,
      breaches: [],
      source: 'offline',
      hint: e instanceof Error ? e.message : 'Network unavailable',
    }
  }
}
