const KEY = 'locket_categories'
const DEFAULTS = ['General', 'Work', 'Social', 'Banking', 'Email', 'Games', 'Subscriptions', '2FA']

export function loadCategories(fromEntries: string[] = []): string[] {
  let custom: string[] = []
  try {
    custom = JSON.parse(localStorage.getItem(KEY) || '[]') as string[]
  } catch {
    custom = []
  }
  const set = new Set<string>([...DEFAULTS, ...custom, ...fromEntries.filter(Boolean)])
  return Array.from(set)
}

export function saveCategory(name: string) {
  const n = name.trim().slice(0, 40)
  if (!n) return
  let custom: string[] = []
  try {
    custom = JSON.parse(localStorage.getItem(KEY) || '[]') as string[]
  } catch {
    custom = []
  }
  const exists = custom.some((c) => c.toLowerCase() === n.toLowerCase()) || DEFAULTS.some((c) => c.toLowerCase() === n.toLowerCase())
  if (!exists) {
    custom.push(n)
    localStorage.setItem(KEY, JSON.stringify(custom))
  }
}
