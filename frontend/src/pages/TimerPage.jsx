import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import { api } from '../api'
import { useTimer, fmtDuration, fmtMinutes, fmtTime } from '../hooks/useTimer'
import { useProjectNames, useDescriptionSuggestions } from '../hooks/useProjects'
import { POMODORO_PHASE_LABELS } from '../hooks/usePomodoro'
import OvertimeBanner from './OvertimeBanner'
import { ManualEntryModal } from './ManualEntryModal'
import { EditEntryModal } from './EditEntryModal'

dayjs.locale('de')

const MOODS    = ['😞', '😕', '😐', '🙂', '😄']

export default function TimerPage({ activeTimer, setActiveTimer, pomodoro, pip }) {
  const [project, setProject]       = useState('Allgemein')
  const [description, setDescription] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [todayData, setTodayData]   = useState(null)
  const [note, setNote]             = useState('')
  const [mood, setMood]             = useState(null)
  const [showManual, setShowManual] = useState(false)
  const [showEdit, setShowEdit]     = useState(null)   // entry to edit

  const { names: projectNames } = useProjectNames()
  const elapsed = useTimer(activeTimer?.start_time, activeTimer?.paused_at, activeTimer?.paused_seconds)
  const isPaused = !!activeTimer?.paused_at
  const pomodoroActive = !!pomodoro.state?.phase
  const pomodoroEnabled = pomodoro.settings ? !!pomodoro.settings.enabled : true
  const today   = dayjs().format('YYYY-MM-DD')

  const loadToday = useCallback(() => {
    api.getDay(today).then(d => {
      setTodayData(d)
      if (d.note) { setNote(d.note.note || ''); setMood(d.note.mood || null) }
    }).catch(() => {})
  }, [today])

  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => { if (!activeTimer) loadToday() }, [activeTimer, loadToday])

  useEffect(() => {
    const interval = setInterval(loadToday, 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadToday() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadToday])

  const handleStart = async () => {
    setLoading(true); setError(null)
    try {
      const e = await api.startTimer({ project, description: description || undefined })
      setActiveTimer(e); setDescription('')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleStop = async () => {
    setLoading(true); setError(null)
    try { await api.stopTimer(); setActiveTimer(null); loadToday() }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handlePause = async () => {
    setLoading(true); setError(null)
    try { const e = await api.pauseTimer(); setActiveTimer(e) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleResume = async () => {
    setLoading(true); setError(null)
    try { const e = await api.resumeTimer(); setActiveTimer(e) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    await api.deleteEntry(id).catch(() => {})
    loadToday()
  }

  const handleSaveNote = async () => {
    await api.saveNote(today, { note, mood }).catch(() => {})
    loadToday()
  }

  const totalToday = (todayData?.total_minutes || 0) + (activeTimer ? elapsed / 60000 : 0)
  const finishedEntries = todayData?.entries?.filter(e => e.end_time) || []

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="label" style={{ marginBottom: 3 }}>{dayjs().format('dddd')}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>{dayjs().format('D. MMMM')}</h1>
        </div>
        {totalToday > 0 && (
          <div style={{ background: 'var(--accent-dim2)', border: '1px solid rgba(200,240,96,.14)', borderRadius: 'var(--r)', padding: '8px 13px', textAlign: 'right' }}>
            <div className="label" style={{ marginBottom: 2 }}>Heute</div>
            <div className="mono" style={{ fontSize: 16, color: 'var(--accent)' }}>{fmtMinutes(totalToday)}</div>
          </div>
        )}
      </div>

      {error && <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '9px 12px', marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{error}</div>}

      {/* Timer card */}
      <div className="card" style={{ marginBottom: 12, borderColor: (activeTimer || pomodoroActive) ? 'rgba(200,240,96,.25)' : 'var(--border)' }}>
        {pomodoroActive ? (
          <PomodoroCard pomodoro={pomodoro} pip={pip} />
        ) : activeTimer ? (
          <RunningTimer activeTimer={activeTimer} elapsed={elapsed} isPaused={isPaused} onStop={handleStop} onPause={handlePause} onResume={handleResume} loading={loading} pip={pip} />
        ) : (
          <StartTimer project={project} setProject={setProject} description={description} setDescription={setDescription} onStart={handleStart} loading={loading} projectNames={projectNames} pomodoroEnabled={pomodoroEnabled} onStartPomodoro={() => pomodoro.start({ project, description: description || undefined }).then(() => setDescription(''))} />
        )}
      </div>

      {/* Manual entry button */}
      <button className="btn btn-ghost w-full" style={{ marginBottom: 16, justifyContent: 'center' }} onClick={() => setShowManual(true)}>
        + Eintrag manuell hinzufügen
      </button>

      {/* Today's entries */}
      {finishedEntries.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 9 }}>Einträge heute</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {finishedEntries.map(e => (
              <EntryRow key={e.id} entry={e} onDelete={() => handleDelete(e.id)} onEdit={() => setShowEdit(e)} />
            ))}
          </div>
        </div>
      )}

      <OvertimeBanner totalMinutes={totalToday} />

      {/* Day note */}
      <div className="card">
        <div className="label" style={{ marginBottom: 11 }}>Tagesnotiz</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
          {MOODS.map((m, i) => (
            <button key={i} onClick={() => setMood(mood === i+1 ? null : i+1)} style={{ fontSize: 19, flex: 1, padding: '5px 4px', border: `1px solid ${mood === i+1 ? 'rgba(200,240,96,.3)' : 'var(--border)'}`, borderRadius: 'var(--r)', background: mood === i+1 ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer', transition: 'all .15s' }}>{m}</button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Was lief gut? Was war schwierig?" style={{ marginBottom: 9 }} />
        <button className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={handleSaveNote}>↑ Notiz speichern</button>
      <SendReportButton day={today} />
      </div>

      {/* Modals */}
      {showManual && (
        <ManualEntryModal
          defaultDate={today}
          onClose={() => setShowManual(false)}
          onSaved={() => { setShowManual(false); loadToday() }}
        />
      )}
      {showEdit && (
        <EditEntryModal
          entry={showEdit}
          onClose={() => setShowEdit(null)}
          onSaved={() => { setShowEdit(null); loadToday() }}
        />
      )}
    </div>
  )
}

function RunningTimer({ activeTimer, elapsed, isPaused, onStop, onPause, onResume, loading, pip }) {
  const color = isPaused ? 'var(--amber)' : 'var(--accent)'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {isPaused ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} /> : <span className="pulse" />}
        <span className="mono" style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '.1em' }}>{isPaused ? 'Pausiert' : 'Läuft'}</span>
        <span style={{ marginLeft: 'auto' }} className="tag tag-g">{activeTimer.project}</span>
        <PipButton pip={pip} />
      </div>
      <div className="mono" style={{ fontSize: 50, fontWeight: 300, color, letterSpacing: '-.02em', lineHeight: 1, marginBottom: 6 }}>
        {fmtDuration(elapsed)}
      </div>
      {activeTimer.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{activeTimer.description}</div>}
      <div className="mono" style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 18 }}>
        Gestartet: {fmtTime(activeTimer.start_time)} Uhr
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {isPaused ? (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onResume} disabled={loading}>▶ Fortsetzen</button>
        ) : (
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onPause} disabled={loading}>⏸ Pausieren</button>
        )}
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={onStop} disabled={loading}>■ Stoppen</button>
      </div>
    </div>
  )
}

function StartTimer({ project, setProject, description, setDescription, onStart, loading, projectNames, pomodoroEnabled, onStartPomodoro }) {
  const suggestions = useDescriptionSuggestions(project)
  return (
    <div>
      <div className="label" style={{ marginBottom: 10 }}>Neuer Eintrag</div>
      <select value={project} onChange={e => setProject(e.target.value)} style={{ marginBottom: 9 }}>
        {projectNames.map(p => <option key={p}>{p}</option>)}
      </select>
      <input type="text" placeholder="Woran arbeitest du? (optional)" value={description} onChange={e => setDescription(e.target.value)} onKeyDown={e => e.key === 'Enter' && onStart()} list="desc-suggestions-start" style={{ marginBottom: 12 }} />
      <datalist id="desc-suggestions-start">
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onStart} disabled={loading}>
          {loading ? '…' : '▶ Timer starten'}
        </button>
        {pomodoroEnabled && (
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onStartPomodoro} disabled={loading}>
            🍅 Als Pomodoro starten
          </button>
        )}
      </div>
    </div>
  )
}

function PipButton({ pip }) {
  if (!pip?.supported) return null
  return (
    <button className="btn-icon" onClick={pip.toggle} title={pip.pipWindow ? 'Schwebendes Fenster schließen' : 'In schwebendem Fenster anzeigen'}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>
    </button>
  )
}

// ── Pomodoro Card ──────────────────────────────────────────────────────────────
function PomodoroCard({ pomodoro, pip }) {
  const { state, settings, remainingMs, skip, continueSession, stop } = pomodoro
  const [loading, setLoading] = useState(false)
  const phase = state.phase
  const label = POMODORO_PHASE_LABELS[phase] || phase
  const isBreak = phase === 'short_break' || phase === 'long_break'
  const color = isBreak ? 'var(--amber)' : 'var(--accent)'
  const cyclesTotal  = settings?.cycles_before_long_break || 4
  const cyclesFilled = state.cycles_completed % cyclesTotal

  const run = (fn) => { setLoading(true); fn().finally(() => setLoading(false)) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {state.awaiting_confirmation ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} /> : <span className="pulse" />}
        <span className="mono" style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '.1em' }}>🍅 {label}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {state.project && <span className="tag tag-g">{state.project}</span>}
          <PipButton pip={pip} />
        </div>
      </div>

      {state.awaiting_confirmation ? (
        <>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 18 }}>{label} bereit — weiter?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => run(continueSession)} disabled={loading}>▶ Weiter</button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => run(stop)} disabled={loading}>■ Abbrechen</button>
          </div>
        </>
      ) : (
        <>
          <div className="mono" style={{ fontSize: 50, fontWeight: 300, color, letterSpacing: '-.02em', lineHeight: 1, marginBottom: 6 }}>
            {fmtDuration(remainingMs)}
          </div>
          {state.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{state.description}</div>}
          <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
            {Array.from({ length: cyclesTotal }).map((_, i) => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < cyclesFilled ? 'var(--accent)' : 'var(--border2)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => run(skip)} disabled={loading}>⏭ Überspringen</button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => run(stop)} disabled={loading}>■ Abbrechen</button>
          </div>
        </>
      )}
    </div>
  )
}

function EntryRow({ entry, onDelete, onEdit }) {
  return (
    <div className="card-sm flex items-center gap-2">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtTime(entry.start_time)}–{fmtTime(entry.end_time)}</span>
          <span className="tag tag-g">{entry.project}</span>
          {entry.source === 1 && <span className="tag tag-m">manuell</span>}
          {entry.source === 2 && <span className="tag" style={{background:'rgba(255,170,0,.12)',color:'#ffaa00'}}>E-Mail</span>}
        </div>
        {entry.description && <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.description}</div>}
      </div>
      <div className="mono" style={{ fontSize: 12, flexShrink: 0 }}>{fmtMinutes(entry.duration_minutes)}</div>
      <button className="btn-icon" onClick={onEdit} title="Bearbeiten">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button className="btn-icon" onClick={onDelete} title="Löschen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
      </button>
    </div>
  )
}

// ── Send Report Button ────────────────────────────────────────────────────────
function SendReportButton({ day }) {
  const [status, setStatus] = useState(null)  // null | 'sending' | 'ok' | 'error'
  const [msg, setMsg] = useState('')

  const handleSend = async () => {
    setStatus('sending')
    try {
      const res = await api.sendReport({ day })
      setStatus('ok'); setMsg(res.message)
      setTimeout(() => setStatus(null), 4000)
    } catch (e) {
      setStatus('error'); setMsg(e.message)
      setTimeout(() => setStatus(null), 5000)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {status && status !== 'sending' && (
        <div style={{ marginBottom: 8, padding: '7px 10px', background: status === 'ok' ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${status === 'ok' ? 'rgba(200,240,96,.3)' : 'var(--red)'}`, borderRadius: 'var(--r)', fontSize: 11, color: status === 'ok' ? 'var(--accent)' : 'var(--red)' }}>
          {status === 'ok' ? '✓ ' : '✗ '}{msg}
        </div>
      )}
      <button
        className="btn btn-ghost w-full"
        style={{ justifyContent: 'center', fontSize: 11 }}
        onClick={handleSend}
        disabled={status === 'sending'}
      >
        {status === 'sending' ? '…' : '✉ Tagesreport per Mail senden'}
      </button>
    </div>
  )
}
