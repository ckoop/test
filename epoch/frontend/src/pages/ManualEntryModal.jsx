import { useState } from 'react'
import { api } from '../api'
import { useProjectNames, useDescriptionSuggestions } from '../hooks/useProjects'
import { localTimeToUTC } from '../hooks/useTimer'

export function ManualEntryModal({ defaultDate, onClose, onSaved }) {
  const { names: projectNames } = useProjectNames()
  const [date, setDate]       = useState(defaultDate)
  const [start, setStart]     = useState('09:00')
  const [end, setEnd]         = useState('10:00')
  const [project, setProject] = useState('Allgemein')
  const [desc, setDesc]       = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const suggestions = useDescriptionSuggestions(project)

  const handleSave = async () => {
    setError(null); setLoading(true)
    try {
      const startUtc = localTimeToUTC(date, start)
      const endUtc   = localTimeToUTC(date, end)
      await api.createManual({ date: startUtc.date, start_time: startUtc.time, end_time: endUtc.time, project, description: desc || undefined })
      onSaved()
    } catch (err) { setError(err.message) }
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
            <input type="text" placeholder="Optional" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} list="desc-suggestions-manual" />
            <datalist id="desc-suggestions-manual">
              {suggestions.map(s => <option key={s} value={s} />)}
            </datalist>
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
