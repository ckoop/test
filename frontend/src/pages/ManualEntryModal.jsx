import { useState } from 'react'
import { api } from '../api'
import { useProjectNames } from '../hooks/useProjects'

export function ManualEntryModal({ defaultDate, onClose, onSaved }) {
  const { names: projectNames } = useProjectNames()
  const [date, setDate]       = useState(defaultDate)
  const [start, setStart]     = useState('09:00')
  const [end, setEnd]         = useState('10:00')
  const [project, setProject] = useState('Allgemein')
  const [desc, setDesc]       = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setError(null); setLoading(true)
    try {
      await api.createManual({ date, start_time: start, end_time: end, project, description: desc || undefined })
      onSaved()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Eintrag hinzufügen</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Datum</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid2">
            <div>
              <div className="label" style={{ marginBottom: 5 }}>Von</div>
              <input type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>Bis</div>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Projekt</div>
            <select value={project} onChange={e => setProject(e.target.value)}>
              {projectNames.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Beschreibung</div>
            <input type="text" placeholder="Optional" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={loading}>
              {loading ? '…' : '✓ Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
