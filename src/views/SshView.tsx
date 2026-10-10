import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, type SshKey, type SshKeyListItem } from '../api'

type Props = { toast: (t: string) => void }

export function SshView({ toast }: Props) {
  const [keys, setKeys] = useState<SshKeyListItem[]>([])
  const [selected, setSelected] = useState<SshKey | null>(null)
  const [showPrivate, setShowPrivate] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    label: '',
    type: 'ed25519' as 'ed25519' | 'rsa' | 'ecdsa',
    comment: 'locket@local',
    passphrase: '',
  })
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    setKeys(await api.sshKeys())
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  const open = async (id: string) => {
    setSelected(await api.sshKey(id))
    setShowPrivate(false)
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const key = await api.createSsh(form)
      await refresh()
      setSelected(key)
      setModal(false)
      toast('SSH key created')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selected || !confirm('Delete key?')) return
    await api.deleteSsh(selected.id)
    setSelected(null)
    await refresh()
    toast('Deleted')
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>SSH</h2>
          <p className="sub">Ed25519 / RSA-4096 / ECDSA · keys stored in encrypted vault</p>
        </div>
        <button className="primary-btn" onClick={() => setModal(true)}>
          New key
        </button>
      </div>

      <div className="layout-split">
        <div className="list-pane">
          <div className="list-scroll">
            {keys.length === 0 ? (
              <div className="empty">
                <strong>No keys</strong>
                Create Ed25519 for servers and Git.
              </div>
            ) : (
              keys.map((k) => (
                <button
                  key={k.id}
                  className={`list-item ${selected?.id === k.id ? 'active' : ''}`}
                  onClick={() => open(k.id)}
                >
                  <div className="title-row">
                    <span className="title">{k.label}</span>
                    <span className="badge">{k.type}</span>
                  </div>
                  <div className="meta">{k.fingerprint}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="detail-pane">
          {!selected ? (
            <div className="empty">
              <strong>Select a key</strong>
              Copy the public key straight into `authorized_keys`.
            </div>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <h3>{selected.label}</h3>
                  <p className="sub" style={{ marginTop: 6 }}>
                    {selected.fingerprint}
                    {selected.passphraseProtected ? ' · with passphrase' : ''}
                  </p>
                </div>
                <div className="actions">
                  <button className="danger-btn" onClick={remove}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label>Public key</label>
                  <textarea readOnly value={selected.publicKey} rows={4} />
                  <button
                    className="icon-btn"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      await navigator.clipboard.writeText(selected.publicKey)
                      toast('Public key copied')
                    }}
                  >
                    Copy public
                  </button>
                </div>
                <div className="field">
                  <label>Private key</label>
                  <textarea
                    readOnly
                    value={showPrivate ? selected.privateKey : '••••••••••••••••'}
                    rows={6}
                  />
                  <div className="actions" style={{ marginTop: 8 }}>
                    <button className="icon-btn" onClick={() => setShowPrivate((v) => !v)}>
                      {showPrivate ? 'Hide' : 'Show'}
                    </button>
                    <button
                      className="icon-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(selected.privateKey)
                        toast('Private key copied')
                      }}
                    >
                      Copy private
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New SSH key</h3>
            <form className="field-grid" onSubmit={create}>
              <div className="field">
                <label>Label</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="VPS / GitHub"
                  required
                />
              </div>
              <div className="field">
                <label>Type</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as typeof form.type })
                  }
                >
                  <option value="ed25519">Ed25519 (recommended)</option>
                  <option value="rsa">RSA 4096</option>
                  <option value="ecdsa">ECDSA 521</option>
                </select>
              </div>
              <div className="field">
                <label>Comment</label>
                <input
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Passphrase (optional)</label>
                <input
                  type="password"
                  value={form.passphrase}
                  onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? 'Generating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
