import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import TimerPage   from './pages/TimerPage'
import WeekPage    from './pages/WeekPage'
import HistoryPage from './pages/HistoryPage'
import StatsPage, { MONTHS } from './pages/StatsPage'
import ExportPage  from './pages/ExportPage'
import MailPage      from './pages/MailPage'
import SettingsPage from './pages/SettingsPage'
import { api } from './api'
import { useTimer, fmtDuration } from './hooks/useTimer'
import { usePomodoro } from './hooks/usePomodoro'
import { useIdleDetection } from './hooks/useIdleDetection'
import FloatingWidget, { usePipWidget } from './FloatingWidget'

dayjs.extend(isoWeek)

export const APP_VERSION = 'v4.10'

const NAV = [
  { to: '/',        label: 'Timer',   Icon: IcoTimer   },
  { to: '/woche',   label: 'Woche',   Icon: IcoWeek    },
  { to: '/verlauf', label: 'Verlauf', Icon: IcoHistory },
  { to: '/stats',   label: 'Stats',   Icon: IcoStats   },
  { to: '/mail',    label: 'Mail',    Icon: IcoMail    },
  { to: '/export',   label: 'Export',   Icon: IcoExport   },
  { to: '/settings', label: 'Settings', Icon: IcoSettings },
]

export default function App() {
  const [activeTimer, setActiveTimer] = useState(null)
  const [statsYear, setStatsYear]   = useState(dayjs().year())
  const [statsMonth, setStatsMonth] = useState(dayjs().month() + 1)
  const [historyProject, setHistoryProject] = useState('')
  const [imapConfigured, setImapConfigured] = useState(null)
  const pomodoro = usePomodoro()
  const pomodoroActive = !!pomodoro.state?.phase
  const pip = usePipWidget()
  const [idleLoading, setIdleLoading] = useState(false)
  const idle = useIdleDetection(!!activeTimer && !activeTimer.paused_at)
  const navigate = useNavigate()
  const location = useLocation()

  // Schwebendes Fenster automatisch schließen, sobald weder Timer noch Pomodoro laufen
  useEffect(() => {
    if (pip.pipWindow && !activeTimer && !pomodoroActive) pip.pipWindow.close()
  }, [pip.pipWindow, activeTimer, pomodoroActive])

  const handleIdleDeduct = async () => {
    if (!idle.prompt) return
    setIdleLoading(true)
    try { setActiveTimer(await api.deductTimer(idle.prompt.seconds)) }
    catch { /* Timer inzwischen gestoppt/pausiert — Hinweis einfach verwerfen */ }
    finally { setIdleLoading(false); idle.dismiss() }
  }

  // Andere Menüpunkte sind gesperrt solange eine Pomodoro-Session läuft — bei
  // direkter URL-Navigation (oder wenn die Session anderswo gestartet wurde) zurück zum Timer.
  useEffect(() => {
    if (pomodoroActive && location.pathname !== '/') navigate('/', { replace: true })
  }, [pomodoroActive, location.pathname, navigate])

  useEffect(() => {
    const refreshActiveTimer = () => api.getActive().then(setActiveTimer).catch(() => {})
    refreshActiveTimer()
    const interval = setInterval(refreshActiveTimer, 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') refreshActiveTimer() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refreshActiveTimer)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refreshActiveTimer)
    }
  }, [])

  useEffect(() => { api.getMailConfig().then(c => setImapConfigured(!!c?.imap?.configured)).catch(() => {}) }, [])

  const mailBadge = imapConfigured === null ? null : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: imapConfigured ? 'var(--accent)' : 'var(--text3)', flexShrink: 0 }} />
      IMAP
    </span>
  )

  const badges = {
    '/': activeTimer ? <RunningBadge activeTimer={activeTimer} /> : null,
    '/woche': `KW ${dayjs().isoWeek()}`,
    '/verlauf': historyProject || 'Alle Projekte',
    '/stats': `${MONTHS[statsMonth - 1]} ${statsYear}`,
    '/mail': mailBadge,
  }
  // Compact variants for the bottom nav (mobile) — narrower items, no year, no Timer-Badge (Live-Dot reicht)
  const mobileBadges = {
    '/woche': badges['/woche'],
    '/verlauf': badges['/verlauf'],
    '/stats': MONTHS[statsMonth - 1],
    '/mail': mailBadge,
  }

  const isPaused = !!activeTimer?.paused_at

  return (
    <div className="app-shell">
      {idle.prompt && <IdleBanner prompt={idle.prompt} onDeduct={handleIdleDeduct} onDismiss={idle.dismiss} loading={idleLoading} />}
      <Sidebar hasActive={!!activeTimer} isPaused={isPaused} badges={badges} locked={pomodoroActive} />
      <div className="main-area">
        <Routes>
          <Route path="/"        element={<TimerPage   activeTimer={activeTimer} setActiveTimer={setActiveTimer} pomodoro={pomodoro} pip={pip} />} />
          <Route path="/woche"   element={<WeekPage />} />
          <Route path="/verlauf" element={<HistoryPage projectFilter={historyProject} setProjectFilter={setHistoryProject} />} />
          <Route path="/stats"   element={<StatsPage year={statsYear} month={statsMonth} setYear={setStatsYear} setMonth={setStatsMonth} />} />
          <Route path="/mail"    element={<MailPage />} />
          <Route path="/export"   element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      <BottomNav hasActive={!!activeTimer} isPaused={isPaused} badges={mobileBadges} locked={pomodoroActive} />
      <FloatingWidget pipWindow={pip.pipWindow} activeTimer={activeTimer} pomodoro={pomodoro} />
    </div>
  )
}

function RunningBadge({ activeTimer }) {
  const elapsed = useTimer(activeTimer.start_time, activeTimer.paused_at, activeTimer.paused_seconds)
  return <>{activeTimer.paused_at && '⏸ '}{fmtDuration(elapsed)}</>
}

function IdleBanner({ prompt, onDeduct, onDismiss, loading }) {
  const minutes = Math.round(prompt.seconds / 60)
  const since = new Date(prompt.since).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px',
      background: 'var(--amber-dim)', borderBottom: '1px solid rgba(255,170,0,.3)',
    }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>⏱</span>
      <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text)' }}>
        Du warst seit {since} Uhr inaktiv (ca. {minutes} Min). Zeit von der laufenden Aufgabe abziehen?
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ justifyContent: 'center' }} onClick={onDismiss} disabled={loading}>Behalten</button>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '7px 14px' }} onClick={onDeduct} disabled={loading}>
          {loading ? '…' : `− ${minutes} Min abziehen`}
        </button>
      </div>
    </div>
  )
}

function Sidebar({ hasActive, isPaused, badges, locked }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Epoch</div>
      <div className="sidebar-version">{APP_VERSION}</div>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, Icon }) => {
          const isLocked = locked && to !== '/'
          return (
            <NavLink
              key={to} to={to} end={to === '/'}
              onClick={e => { if (isLocked) e.preventDefault() }}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '') + (isLocked ? ' locked' : '')}
              style={isLocked ? { opacity: .35, cursor: 'not-allowed' } : undefined}
              title={isLocked ? 'Gesperrt während Pomodoro läuft' : undefined}
              aria-disabled={isLocked || undefined}
            >
              {({ isActive }) => (
                <>
                  <span className="sidebar-icon-wrap">
                    <Icon active={isActive} />
                    {to === '/' && hasActive && <span className={'sidebar-live-dot' + (isPaused ? ' paused' : '')} />}
                  </span>
                  {label}
                  {!isLocked && badges[to] && <span className="sidebar-badge">{badges[to]}</span>}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

function BottomNav({ hasActive, isPaused, badges, locked }) {
  return (
    <nav className="bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(var(--nav-h) + var(--safe-b))',
      paddingBottom: 'var(--safe-b)',
      background: 'rgba(10,10,10,.96)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      zIndex: 100,
    }}>
      {NAV.map(({ to, label, Icon }) => {
        const isLocked = locked && to !== '/'
        return (
          <NavLink
            key={to} to={to} end={to === '/'}
            onClick={e => { if (isLocked) e.preventDefault() }}
            title={isLocked ? 'Gesperrt während Pomodoro läuft' : undefined}
            aria-disabled={isLocked || undefined}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '10px 4px', textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              fontFamily: 'var(--sans)', fontSize: 8, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.09em',
              transition: 'color .15s', position: 'relative', flex: 1,
              opacity: isLocked ? .35 : 1, cursor: isLocked ? 'not-allowed' : 'pointer',
            })}>
            {({ isActive }) => (
              <>
                <span style={{ position: 'relative' }}>
                  <Icon active={isActive} />
                  {to === '/' && hasActive && (
                    <span style={{ position: 'absolute', top: -1, right: -3, width: 5, height: 5, borderRadius: '50%', background: isPaused ? 'var(--amber)' : 'var(--accent)' }} />
                  )}
                </span>
                {label}
                {!isLocked && badges?.[to] && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 7, fontWeight: 400,
                    textTransform: 'none', letterSpacing: 0,
                    color: isActive ? 'var(--accent)' : 'var(--text3)',
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{badges[to]}</span>
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

const sw = (a) => (a ? 2.5 : 1.8)
function IcoTimer({ active })   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 3h6M12 3v2"/></svg> }
function IcoWeek({ active })    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg> }
function IcoHistory({ active }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/></svg> }
function IcoStats({ active })   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><path d="M3 20h18M8 20V10M12 20V4M16 20v-8"/></svg> }
function IcoMail({ active })    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg> }
function IcoExport({ active })   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function IcoSettings({ active }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
