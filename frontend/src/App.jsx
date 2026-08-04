import { Routes, Route, NavLink } from 'react-router-dom'
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

dayjs.extend(isoWeek)

export const APP_VERSION = 'v3.4'

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
  const [imapConfigured, setImapConfigured] = useState(null)
  useEffect(() => { api.getActive().then(setActiveTimer).catch(() => {}) }, [])
  useEffect(() => { api.getMailConfig().then(c => setImapConfigured(!!c?.imap?.configured)).catch(() => {}) }, [])

  const mailBadge = imapConfigured === null ? null : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: imapConfigured ? 'var(--accent)' : 'var(--text3)', flexShrink: 0 }} />
      IMAP
    </span>
  )

  const badges = {
    '/woche': `KW ${dayjs().isoWeek()}`,
    '/stats': `${MONTHS[statsMonth - 1]} ${statsYear}`,
    '/mail': mailBadge,
  }
  // Compact variants for the bottom nav (mobile) — narrower items, no year
  const mobileBadges = {
    '/woche': badges['/woche'],
    '/stats': MONTHS[statsMonth - 1],
    '/mail': mailBadge,
  }

  return (
    <div className="app-shell">
      <Sidebar hasActive={!!activeTimer} badges={badges} />
      <div className="main-area">
        <Routes>
          <Route path="/"        element={<TimerPage   activeTimer={activeTimer} setActiveTimer={setActiveTimer} />} />
          <Route path="/woche"   element={<WeekPage />} />
          <Route path="/verlauf" element={<HistoryPage />} />
          <Route path="/stats"   element={<StatsPage year={statsYear} month={statsMonth} setYear={setStatsYear} setMonth={setStatsMonth} />} />
          <Route path="/mail"    element={<MailPage />} />
          <Route path="/export"   element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      <BottomNav hasActive={!!activeTimer} badges={mobileBadges} />
    </div>
  )
}

function Sidebar({ hasActive, badges }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Time<br />Tracker</div>
      <div className="sidebar-version">{APP_VERSION}</div>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
            {({ isActive }) => (
              <>
                <span className="sidebar-icon-wrap">
                  <Icon active={isActive} />
                  {to === '/' && hasActive && <span className="sidebar-live-dot" />}
                </span>
                {label}
                {badges[to] && <span className="sidebar-badge">{badges[to]}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function BottomNav({ hasActive, badges }) {
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
      {NAV.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '10px 4px', textDecoration: 'none',
          color: isActive ? 'var(--accent)' : 'var(--text3)',
          fontFamily: 'var(--sans)', fontSize: 8, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.09em',
          transition: 'color .15s', position: 'relative', flex: 1,
        })}>
          {({ isActive }) => (
            <>
              <span style={{ position: 'relative' }}>
                <Icon active={isActive} />
                {to === '/' && hasActive && (
                  <span style={{ position: 'absolute', top: -1, right: -3, width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </span>
              {label}
              {badges?.[to] && (
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
      ))}
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
