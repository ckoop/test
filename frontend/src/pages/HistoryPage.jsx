import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import { api } from '../api'
import { fmtMinutes, fmtTime } from '../hooks/useTimer'
import { useProjectNames } from '../hooks/useProjects'
import OvertimeBanner from './OvertimeBanner'
import { ManualEntryModal } from './ManualEntryModal'

dayjs.locale('de')

export default function HistoryPage() {
  const [entries, setEntries]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [from, setFrom]         = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [to, setTo]             = useState(dayjs().format('YYYY-MM-DD'))
  const [showManual, setShowManual] = useState(false)
  const [projectFilter, setProjectFilter] = useState('')
  const [taskFilter, setTaskFilter]       = useState('')
  const { names: projectNames } = useProjectNames()

  const load = () => {
    setLoading(true)
    api.getEntries({ from_date: from, to_date: to }).then(setEntries).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [from, to])

  const taskQuery = taskFilter.trim().toLowerCase()
  const finished = entries.filter(e =>
    e.end_time &&
    (!projectFilter || e.project === projectFilter) &&
    (!taskQuery || (e.description || '').toLowerCase().includes(taskQuery))
  )
  const total    = finished.reduce((s, e) => s + (e.duration_minutes || 0), 0)

  const grouped  = finished.reduce((acc, e) => {
    ;(acc[e.date] = acc[e.date] || []).push(e)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 3 }}>Zeiterfassung</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>Verlauf</h1>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Von</div>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Bis</div>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Projekt</div>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
              <option value="">Alle Projekte</option>
              {projectNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>Aufgabe</div>
            <input type="text" placeholder="Suche…" value={taskFilter} onChange={e => setTaskFilter(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{finished.length} Einträge · {fmtMinutes(total)}</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(projectFilter || taskFilter) && (
              <button className="btn btn-ghost" onClick={() => { setProjectFilter(''); setTaskFilter('') }}>Filter zurücksetzen</button>
            )}
            <button className="btn btn-ghost" onClick={() => { setFrom(dayjs().subtract(7,'day').format('YYYY-MM-DD')); setTo(dayjs().format('YYYY-MM-DD')) }}>7 Tage</button>
            <button className="btn btn-ghost" onClick={() => { setFrom(dayjs().subtract(30,'day').format('YYYY-MM-DD')); setTo(dayjs().format('YYYY-MM-DD')) }}>30 Tage</button>
          </div>
        </div>
      </div>

      <button className="btn btn-ghost w-full" style={{ marginBottom: 14, justifyContent: 'center' }} onClick={() => setShowManual(true)}>
        + Eintrag manuell hinzufügen
      </button>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Laden…</div>
      ) : dates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)', fontSize: 13 }}>Keine Einträge im gewählten Zeitraum</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {dates.map(date => {
            const dayEntries = grouped[date]
            const dayTotal   = dayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0)
            const d = dayjs(date)
            const isToday = date === dayjs().format('YYYY-MM-DD')
            return (
              <div key={date}>
                <div className="flex items-center justify-between" style={{ marginBottom: 5, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
                  <div className="mono" style={{ fontSize: 11, color: isToday ? 'var(--accent)' : 'var(--text2)' }}>{isToday ? 'Heute · ' : ''}{d.format('ddd, D. MMM YYYY')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="mono" style={{ fontSize: 11 }}>{fmtMinutes(dayTotal)}</div>
                    <OvertimeBanner totalMinutes={dayTotal} compact />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {dayEntries.map(e => (
                    <HistoryRow key={e.id} entry={e} onDelete={() => api.deleteEntry(e.id).then(load)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showManual && (
        <ManualEntryModal
          defaultDate={dayjs().format('YYYY-MM-DD')}
          onClose={() => setShowManual(false)}
          onSaved={() => { setShowManual(false); load() }}
        />
      )}
    </div>
  )
}

function HistoryRow({ entry, onDelete }) {
  return (
    <div className="card-sm flex items-center gap-2" style={{ padding: '9px 12px' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>
        {fmtTime(entry.start_time)}–{fmtTime(entry.end_time)}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span className="tag tag-g">{entry.project}</span>
        {entry.source === 1 && <span className="tag tag-m">manuell</span>}{entry.source === 2 && <span className="tag" style={{background:"rgba(255,170,0,.12)",color:"#ffaa00"}}>E-Mail</span>}
        {entry.description && <span style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description}</span>}
      </div>
      <div className="mono" style={{ fontSize: 12, flexShrink: 0 }}>{fmtMinutes(entry.duration_minutes)}</div>
      <button className="btn-icon" onClick={() => { if (confirm('Löschen?')) onDelete() }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
      </button>
    </div>
  )
}
