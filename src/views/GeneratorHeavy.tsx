import { useEffect, useState } from 'react'
import { api, type GenResult } from '../api'

type Props = { toast: (t: string) => void }

const MODES = [
  { id: 'heavy', label: 'Heavy', hint: '32+ chars, all classes' },
  { id: 'random', label: 'Classic', hint: 'Standard password' },
  { id: 'passphrase', label: 'Passphrase', hint: 'Words with hyphens' },
  { id: 'memorable', label: 'Memorable', hint: 'Word-like' },
  { id: 'hex', label: 'HEX', hint: 'For tokens' },
  { id: 'base64', label: 'Base64', hint: 'API keys' },
  { id: 'pin', label: 'PIN', hint: 'Digits only' },
] as const

export function GeneratorHeavy({ toast }: Props) {
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('heavy')
  const [length, setLength] = useState(32)
  const [words, setWords] = useState(6)
  const [upper, setUpper] = useState(true)
  const [lower, setLower] = useState(true)
  const [digits, setDigits] = useState(true)
  const [symbols, setSymbols] = useState(true)
  const [ambiguous, setAmbiguous] = useState(true)
  const [result, setResult] = useState<GenResult | null>(null)

  const generate = async () => {
    const res = await api.generate({
      mode,
      length,
      words,
      upper,
      lower,
      digits,
      symbols,
      ambiguous,
      capitalize: true,
      separator: '-',
    })
    setResult(res)
  }

  useEffect(() => {
    generate().catch(() => undefined)
  }, [mode])

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Generator</h2>
          <p className="sub">Strong passwords, passphrases, PINs, entropy and crack-time estimates</p>
        </div>
      </div>

      <div className="filters">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`chip ${mode === m.id ? 'active' : ''}`}
            onClick={() => {
              setMode(m.id)
              if (m.id === 'heavy') setLength(32)
              if (m.id === 'random') setLength(16)
            }}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="panel gen-panel">
        <div className="gen-password">{result?.password || '…'}</div>

        {result && (
          <div className="stat-row">
            <div className="stat">
              <span>Entropy</span>
              <strong>{result.entropyBits} bits</strong>
            </div>
            <div className="stat">
              <span>Strength</span>
              <strong>{result.strength}</strong>
            </div>
            <div className="stat">
              <span>Offline crack</span>
              <strong>{result.crackTime}</strong>
            </div>
          </div>
        )}

        {mode === 'passphrase' ? (
          <div className="range-row">
            <label>
              Words: <strong>{words}</strong>
            </label>
            <input
              type="range"
              min={3}
              max={10}
              value={words}
              onChange={(e) => setWords(Number(e.target.value))}
            />
          </div>
        ) : (
          <div className="range-row">
            <label>
              Length: <strong>{length}</strong>
            </label>
            <input
              type="range"
              min={mode === 'pin' ? 4 : 8}
              max={mode === 'heavy' ? 64 : 48}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </div>
        )}

        {!['hex', 'base64', 'pin'].includes(mode) && (
          <div className="checks">
            <label>
              <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> A–Z
            </label>
            <label>
              <input type="checkbox" checked={lower} onChange={(e) => setLower(e.target.checked)} /> a–z
            </label>
            <label>
              <input type="checkbox" checked={digits} onChange={(e) => setDigits(e.target.checked)} /> Digits
            </label>
            <label>
              <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} /> Symbols
            </label>
            <label>
              <input
                type="checkbox"
                checked={ambiguous}
                onChange={(e) => setAmbiguous(e.target.checked)}
              />{' '}
              No 0/O/1/l
            </label>
          </div>
        )}

        <div className="actions">
          <button className="primary-btn" onClick={() => generate()}>
            Generate
          </button>
          <button
            className="ghost-btn"
            onClick={async () => {
              if (!result) return
              await navigator.clipboard.writeText(result.password)
              toast('Copied')
            }}
          >
            Copy
          </button>
          <button
            className="ghost-btn"
            onClick={async () => {
              if (!result) return
              try {
                const leak = await api.checkPasswordLeak(result.password)
                toast(leak.breached ? `In breaches ×${leak.count}` : 'Not found in breaches')
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Error')
              }
            }}
          >
            Check breaches
          </button>
        </div>
      </div>
    </>
  )
}
