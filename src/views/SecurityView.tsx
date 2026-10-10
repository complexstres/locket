import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, type AuditResult, type EmailLeak, type PasswordLeak } from '../api'

type Props = { toast: (t: string) => void }

export function SecurityView({ toast }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailResult, setEmailResult] = useState<EmailLeak | null>(null)
  const [passResult, setPassResult] = useState<PasswordLeak | null>(null)
  const [audit, setAudit] = useState<AuditResult | null>(null)
  const [loading, setLoading] = useState('')

  const checkEmail = async (e: FormEvent) => {
    e.preventDefault()
    setLoading('email')
    setEmailResult(null)
    try {
      setEmailResult(await api.checkEmailLeak(email))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading('')
    }
  }

  const checkPass = async (e: FormEvent) => {
    e.preventDefault()
    setLoading('pass')
    setPassResult(null)
    try {
      setPassResult(await api.checkPasswordLeak(password))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading('')
    }
  }

  const runAudit = async (withBreaches: boolean) => {
    setLoading('audit')
    try {
      const res = await api.audit(withBreaches)
      setAudit(res)
      toast(withBreaches ? `Audit + breaches (${res.checked} passwords)` : 'Audit complete')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading('')
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Security</h2>
          <p className="sub">Email and password breaches · vault audit · Have I Been Pwned</p>
        </div>
      </div>

      <div className="cards-grid">
        <form className="panel pad" onSubmit={checkEmail}>
          <h3 className="panel-title">Email check</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Search public breach databases (XposedOrNot). Only the email is sent for lookup; vault passwords are not.
          </p>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mail.com"
              required
            />
          </div>
          <button className="primary-btn" type="submit" disabled={loading === 'email'}>
            {loading === 'email' ? 'Checking…' : 'Check email'}
          </button>
          {emailResult && (
            <div className={`result-box ${emailResult.breached ? 'bad' : 'good'}`}>
              {emailResult.breached ? (
                <>
                  <strong>Found in breaches</strong>
                  <div className="breach-tags">
                    {emailResult.breaches.map((b) => (
                      <span key={b} className="badge">
                        {b}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <strong>No breaches found</strong>
              )}
              {emailResult.hint && <p className="hint">{emailResult.hint}</p>}
            </div>
          )}
        </form>

        <form className="panel pad" onSubmit={checkPass}>
          <h3 className="panel-title">Password check</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            HIBP k-anonymity: only the SHA-1 prefix is sent; the full password is never transmitted.
          </p>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="primary-btn" type="submit" disabled={loading === 'pass'}>
            {loading === 'pass' ? 'Checking…' : 'Check password'}
          </button>
          {passResult && (
            <div className={`result-box ${passResult.breached ? 'bad' : 'good'}`}>
              {passResult.breached ? (
                <strong>In breaches ×{passResult.count.toLocaleString('en-US')}</strong>
              ) : (
                <strong>Not found in known breaches</strong>
              )}
            </div>
          )}
        </form>
      </div>

      <div className="panel pad" style={{ marginTop: 18 }}>
        <div className="detail-head">
          <div>
            <h3 className="panel-title">Vault audit</h3>
            <p className="hint" style={{ margin: 0 }}>
              Weak, reused, stale, and empty passwords. Optionally check against HIBP.
            </p>
          </div>
          <div className="actions">
            <button className="ghost-btn" onClick={() => runAudit(false)} disabled={!!loading}>
              Quick audit
            </button>
            <button className="primary-btn" onClick={() => runAudit(true)} disabled={!!loading}>
              {loading === 'audit' ? 'Scanning…' : 'Audit + breaches'}
            </button>
          </div>
        </div>

        {audit && (
          <>
            <div
              className="score-ring"
              style={{
                background: `radial-gradient(circle at center, #18181b 54%, transparent 55%), conic-gradient(#a1a1aa ${audit.score}%, rgba(255,255,255,0.08) 0)`,
              }}
            >
              <div className="score-num">{audit.score}</div>
              <div className="score-label">of 100</div>
            </div>
            {audit.issues.length === 0 ? (
              <div className="result-box good">
                <strong>No issues found</strong>
              </div>
            ) : (
              <div className="issue-list">
                {audit.issues.map((issue, i) => (
                  <div key={`${issue.entryId}-${issue.kind}-${i}`} className="issue-row">
                    <span className={`badge kind-${issue.kind}`}>{issue.kind}</span>
                    <strong>{issue.title}</strong>
                    <span className="meta">{issue.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
