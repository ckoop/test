import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/de'
import { api } from '../api'
import { fmtMinutes, fmtTime } from '../hooks/useTimer'
import OvertimeBanner from './OvertimeBanner'
import { ManualEntryModal } from './ManualEntryModal'

dayjs.extend(isoWeek)
dayjs.locale('de')

export default function WeekPage() {
  const [offset, setOffset]     = useState(0)
  const [weekData, setWeekData] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showManual, setShowManual] = useState(null) // date string

  const weekStart = dayjs().startOf('isoWeek').add(offset, 'week')

  const load = () => {
    setLoading(true)
    api.getWeek(weekStart.format('YYYY-MM-DD')).then(setWeekData).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [offset])

  const totalMin  = weekData.reduce((s, d) => s + d.total_minutes, 0)
  const workDays  = weekData.filter(d => d.total_minutes > 0).length
  const target    = 5 * 8 * 60
  const progress  = Math.min(totalMin / target, 1)
  const maxMin    = Math.max(...weekData.map(d => d.total_minutes), 8*60)
  const today     = dayjs().format('YYYY-MM-DD')

  return (
    <div className="page fade-in">
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="label" style={{ marginBottom: 3 }}>KW {weekStart.isoWeek()}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>
            {offset === 0 ? 'Diese Woche' : offset === -1 ? 'Letzte Woche' : weekStart.format('D. MMM')}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setOffset(o => o - 1)}>←</button>
          {offset < 0 && <button className="btn btn-ghost" onClick={() => setOffset(0)}>Heute</button>}
          {offset < 0 && <button className="btn btn-ghost" onClick={() => setOffset(o => o + 1)}>→</button>}
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="grid2" style={{ marginBottom: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 3 }}>Gesamt</div>
            <div className="mono" style={{ fontSize: 24, color: 'var(--accent)', letterSpacing: '-.02em' }}>{fmtMinutes(totalMin)}</div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 3 }}>Ø / Tag</div>
            <div className="mono" style={{ fontSize: 24, letterSpacing: '-.02em' }}>{workDays > 0 ? fmtMinutes(totalMin / workDays) : '–'}</div>
          </div>
        </div>
        <div className="label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span>Wochenziel (40h)</span><span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress*100}%`, background: 'var(--accent)', opacity: progress >= 1 ? 1 : .65 }} /></div>
      </div>

      {/* Bar chart */}
      {weekData.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(8*60/maxMin)*64}px`, borderTop: '1px dashed color-mix(in srgb, var(--accent) 20%, transparent)', pointerEvents: 'none' }} />
              {weekData.map((d, i) => {
                const h = maxMin > 0 ? (d.total_minutes / maxMin) * 64 : 0
                const isToday = d.date === today
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ width: '100%', height: Math.max(h, d.total_minutes > 0 ? 3 : 0), background: isToday ? 'var(--accent)' : i >= 5 ? 'var(--bg4)' : 'color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: '3px 3px 0 0', transition: 'height .5s' }} />
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
            {['Mo','Di','Mi','Do','Fr','Sa','So'].map((l, i) => (
              <div key={l} style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: weekData[i]?.date === today ? 'var(--accent)' : 'var(--text3)' }}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {/* Day cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Laden…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {weekData.map(day => (
            <DayCard key={day.date} day={day} today={today} onAddManual={() => setShowManual(day.date)} onRefresh={load} />
          ))}
        </div>
      )}

      {showManual && (
        <ManualEntryModal
          defaultDate={showManual}
          onClose={() => setShowManual(null)}
          onSaved={() => { setShowManual(null); load() }}
        />
      )}
    </div>
  )
}

function DayCard({ day, today, onAddManual, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const d = dayjs(day.date)
  const isToday   = day.date === today
  const isWeekend = d.day() === 0 || d.day() === 6
  const finished  = day.entries.filter(e => e.end_time)

  return (
    <div className="card-sm" style={{ opacity: isWeekend && day.total_minutes === 0 ? .4 : 1, border: isToday ? '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' : '1px solid var(--border)' }}>
      <div className="flex items-center gap-3" onClick={() => finished.length > 0 && setExpanded(x => !x)} style={{ cursor: finished.length > 0 ? 'pointer' : 'default' }}>
        <div style={{ width: 34, textAlign: 'center', flexShrink: 0 }}>
          <div className="label" style={{ fontSize: 9 }}>{d.format('ddd')}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: isToday ? 'var(--accent)' : 'var(--text)', lineHeight: 1.2 }}>{d.format('D')}</div>
        </div>
        <div style={{ flex: 1 }}>
          {day.total_minutes > 0
            ? <div className="mono" style={{ fontSize: 13 }}>{fmtMinutes(day.total_minutes)}</div>
            : <div style={{ fontSize: 11, color: 'var(--text3)' }}>Kein Eintrag</div>}
          <OvertimeBanner totalMinutes={day.total_minutes} compact />
          {day.note?.note && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.note.mood ? ['😞','😕','😐','🙂','😄'][day.note.mood-1]+' ' : ''}{day.note.note}</div>}
        </div>
        <button className="btn-icon" onClick={e => { e.stopPropagation(); onAddManual() }} title="Eintrag hinzufügen" style={{ color: 'var(--text3)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        {finished.length > 0 && <div className="mono" style={{ fontSize: 9, color: 'var(--text3)' }}>{expanded ? '↑' : `${finished.length} ▾`}</div>}
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {finished.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{fmtTime(e.start_time)}–{fmtTime(e.end_time)}</span>
              <span className="tag tag-g">{e.project}</span>
              {e.source === 1 && <span className="tag tag-m">manuell</span>}{e.source === 2 && <span className="tag" style={{background:"rgba(255,170,0,.12)",color:"#ffaa00"}}>E-Mail</span>}
              {e.description && <span style={{ fontSize: 10, color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</span>}
              <span className="mono" style={{ fontSize: 10, flexShrink: 0 }}>{fmtMinutes(e.duration_minutes)}</span>
              <button className="btn-icon" onClick={() => api.deleteEntry(e.id).then(onRefresh)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14H6L5 6"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
