import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, type Note, type NoteListItem } from '../api'

type Props = { toast: (t: string) => void }

export function NotesView({ toast }: Props) {
  const [list, setList] = useState<NoteListItem[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', tags: '' })

  const refresh = async () => setList(await api.notes())

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  const open = async (id: string) => {
    const note = await api.note(id)
    setSelected(note)
    setForm({ title: note.title, body: note.body, tags: note.tags.join(', ') })
    setEditing(false)
  }

  const create = async () => {
    const note = await api.createNote({ title: 'New note', body: '', tags: [] })
    await refresh()
    await open(note.id)
    setEditing(true)
    toast('Note created')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const updated = await api.updateNote(selected.id, {
      title: form.title,
      body: form.body,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    })
    setSelected(updated)
    setEditing(false)
    await refresh()
    toast('Saved')
  }

  const remove = async () => {
    if (!selected || !confirm('Delete note?')) return
    await api.deleteNote(selected.id)
    setSelected(null)
    await refresh()
    toast('Deleted')
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Notes</h2>
          <p className="sub">Secret notes, recovery codes, Wi‑Fi — all in the vault</p>
        </div>
        <button className="primary-btn" onClick={create}>
          New
        </button>
      </div>

      <div className="layout-split">
        <div className="list-pane">
          <div className="list-scroll">
            {list.length === 0 ? (
              <div className="empty">
                <strong>Empty</strong>
                Store what is not a password: seed phrases, PIN envelopes, instructions.
              </div>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  className={`list-item ${selected?.id === n.id ? 'active' : ''}`}
                  onClick={() => open(n.id)}
                >
                  <div className="title-row">
                    <span className="title">{n.title}</span>
                  </div>
                  <div className="meta">{n.preview || '—'}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="detail-pane">
          {!selected ? (
            <div className="empty">
              <strong>Select a note</strong>
            </div>
          ) : editing ? (
            <form className="field-grid" onSubmit={save}>
              <div className="field">
                <label>Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Tags (comma-separated)</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="wifi, bank"
                />
              </div>
              <div className="field">
                <label>Body</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={12}
                />
              </div>
              <div className="actions">
                <button type="submit" className="primary-btn">
                  Save
                </button>
                <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <h3>{selected.title}</h3>
                  <p className="sub" style={{ marginTop: 6 }}>
                    {selected.tags.join(' · ') || 'no tags'}
                  </p>
                </div>
                <div className="actions">
                  <button className="icon-btn" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  <button className="danger-btn" onClick={remove}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="mail-body">{selected.body || 'Empty'}</div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
