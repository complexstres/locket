import { randomBytes, randomInt } from 'node:crypto'

const WORDS = [
  'apple', 'bridge', 'canyon', 'delta', 'ember', 'forest', 'galaxy', 'harbor',
  'island', 'jungle', 'kernel', 'lantern', 'meadow', 'nebula', 'orbit', 'planet',
  'quartz', 'river', 'summit', 'thunder', 'umbra', 'valley', 'willow', 'xenon',
  'yellow', 'zenith', 'anchor', 'breeze', 'crystal', 'dragon', 'echo', 'falcon',
  'iceberg', 'balcony', 'cherry', 'spruce', 'giraffe', 'emerald', 'neutron',
  'rainbow', 'tiger', 'citrus', 'storm', 'shield', 'mountain', 'pearl', 'frost',
  'coffee', 'island', 'fountain', 'castle', 'spark', 'lantern', 'harvest',
  'orbit', 'meadow', 'willow', 'harbor', 'canyon', 'ember', 'zenith',
]

const CONSONANTS = 'bcdfghjkmnpqrstvwxz'
const VOWELS = 'aeiouy'

export type GenMode = 'random' | 'passphrase' | 'pin' | 'hex' | 'base64' | 'memorable' | 'heavy'

export type GenOptions = {
  mode?: GenMode
  length?: number
  words?: number
  upper?: boolean
  lower?: boolean
  digits?: boolean
  symbols?: boolean
  ambiguous?: boolean
  separator?: string
  capitalize?: boolean
}

function pick(alphabet: string, n: number): string {
  const buf = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += alphabet[buf[i]! % alphabet.length]
  return out
}

function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize <= 1 || length <= 0) return 0
  return Math.round(length * Math.log2(alphabetSize) * 10) / 10
}

function crackEstimate(bits: number): string {
  // assume 1e12 guesses/sec (serious offline attack)
  if (bits < 28) return 'seconds'
  if (bits < 40) return 'minutes–hours'
  if (bits < 50) return 'days–weeks'
  if (bits < 60) return 'years'
  if (bits < 80) return 'thousands of years'
  if (bits < 100) return 'millions of years'
  return 'practically forever'
}

function strengthLabel(bits: number): string {
  if (bits < 40) return 'Weak'
  if (bits < 60) return 'Fair'
  if (bits < 80) return 'Strong'
  if (bits < 100) return 'Very strong'
  return 'Extremely strong'
}

export function generatePassword(opts: GenOptions = {}) {
  const mode: GenMode = opts.mode || 'random'
  const ambiguous = opts.ambiguous !== false

  if (mode === 'pin') {
    const length = Math.min(16, Math.max(4, opts.length || 6))
    const password = pick('0123456789', length)
    const bits = entropyBits(10, length)
    return pack(password, bits, mode, 10, length)
  }

  if (mode === 'hex') {
    const length = Math.min(128, Math.max(8, opts.length || 32))
    const password = pick('0123456789abcdef', length)
    return pack(password, entropyBits(16, length), mode, 16, length)
  }

  if (mode === 'base64') {
    const length = Math.min(128, Math.max(8, opts.length || 24))
    const password = randomBytes(Math.ceil((length * 3) / 4))
      .toString('base64')
      .replace(/[+/=]/g, () => pick('abcdefghijkmnopqrstuvwxyz23456789', 1))
      .slice(0, length)
    return pack(password, entropyBits(64, length), mode, 64, length)
  }

  if (mode === 'passphrase') {
    const count = Math.min(12, Math.max(3, opts.words || 5))
    const sep = opts.separator ?? '-'
    const capitalize = opts.capitalize !== false
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      let w = WORDS[randomInt(WORDS.length)]!
      if (capitalize) w = w.charAt(0).toUpperCase() + w.slice(1)
      parts.push(w)
    }
    if (opts.digits !== false) parts.push(String(randomInt(10, 99)))
    if (opts.symbols) parts.push(pick('!@#$%&*', 1))
    const password = parts.join(sep)
    const bits = entropyBits(WORDS.length, count) + (opts.digits !== false ? entropyBits(90, 1) : 0)
    return pack(password, bits, mode, WORDS.length, count)
  }

  if (mode === 'memorable') {
    const length = Math.min(32, Math.max(8, opts.length || 12))
    let password = ''
    for (let i = 0; i < length; i++) {
      const set = i % 2 === 0 ? CONSONANTS : VOWELS
      password += set[randomInt(set.length)]
    }
    if (opts.upper !== false) {
      password = password
        .split('')
        .map((c, i) => (i % 4 === 0 ? c.toUpperCase() : c))
        .join('')
    }
    if (opts.digits !== false) {
      const chars = password.split('')
      chars[randomInt(chars.length)] = String(randomInt(2, 9))
      password = chars.join('')
    }
    return pack(password, entropyBits(20, length), mode, 20, length)
  }

  // random + heavy
  const length = Math.min(128, Math.max(8, opts.length || (mode === 'heavy' ? 32 : 16)))
  let alphabet = ''
  const lower = opts.lower !== false
  const upper = opts.upper !== false
  const digits = opts.digits !== false
  const symbols = mode === 'heavy' ? opts.symbols !== false : opts.symbols === true

  if (lower) alphabet += ambiguous ? 'abcdefghijkmnopqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz'
  if (upper) alphabet += ambiguous ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (digits) alphabet += ambiguous ? '23456789' : '0123456789'
  if (symbols) {
    alphabet += mode === 'heavy' ? '!@#$%^&*()-_=+[]{};:,.<>?/|~' : '!@#$%&*-_=+?'
  }
  if (!alphabet) alphabet = 'abcdefghijkmnopqrstuvwxyz23456789'

  // ensure each selected class appears at least once for heavy mode
  let password = pick(alphabet, length)
  if (mode === 'heavy') {
    const required: string[] = []
    if (lower) required.push(pick(ambiguous ? 'abcdefghijkmnopqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz', 1))
    if (upper) required.push(pick(ambiguous ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1))
    if (digits) required.push(pick(ambiguous ? '23456789' : '0123456789', 1))
    if (symbols) required.push(pick('!@#$%^&*()-_=+', 1))
    const chars = password.split('')
    required.forEach((ch, i) => {
      chars[i % chars.length] = ch
    })
    // shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
    }
    password = chars.join('')
  }

  return pack(password, entropyBits(alphabet.length, length), mode, alphabet.length, length)
}

function pack(password: string, bits: number, mode: GenMode, alphabetSize: number, units: number) {
  return {
    password,
    entropyBits: bits,
    strength: strengthLabel(bits),
    crackTime: crackEstimate(bits),
    mode,
    alphabetSize,
    units,
  }
}
