import { useState } from 'react'
import { api } from '../api'
import { useProjectNames, useDescriptionSuggestions } from '../hooks/useProjects'
import { localTimeToUTC, utcToLocalTime } from '../hooks/useTimer'

function localDateOf(isoStr) {
  const d = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z')
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function EditEntryModal({ entry, onClose, onSaved }) {
  const [start, setStart]     = useState(utcToLocalTime(entry.start_time))
  const [end, setEnd]         = useState(utcToLocalTime(entry.end_time))
  const [project, setProject] = useState(entry.project || 'Allgemein')
  const [desc, setDesc]       = useState(entry.description || '')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const { names: projectNames } = useProjectNames()
  const suggestions = useDescriptionSuggestions(project)

  const handleSave = async () => {
    setError(null); setLoading(true)
    try {
      const day      = localDateOf(entry.start_time)
      const startUtc = localTimeToUTC(day, start)
      const endUtc   = localTimeToUTC(day, end)
      await api.updateEntry(entry.id, { start_time: startUtc.time, end_time: endUtc.time, project, description: desc })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Eintrag bearbeiten</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            <input type="text" placeholder="Optional" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} list="desc-suggestions-edit" />
            <datalist id="desc-suggestions-edit">
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
