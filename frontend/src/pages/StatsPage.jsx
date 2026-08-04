import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api } from '../api'
import { fmtMinutes } from '../hooks/useTimer'

dayjs.locale('de')
export const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

export default function StatsPage({ year, month, setYear, setMonth }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getMonthlyStats(year, month).then(setStats).catch(() => {}).finally(() => setLoading(false))
  }, [year, month])

  const projData = stats ? Object.entries(stats.by_project).map(([name, mins]) => ({ name, hours: Math.round(mins/60*10)/10, mins })).sort((a,b) => b.mins - a.mins) : []

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y+1) } else setMonth(m => m+1) }

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 3 }}>Auswertung</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>Statistiken</h1>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <button className="btn-icon" onClick={prevMonth}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{MONTHS[month-1]} {year}</div>
          <button className="btn-icon" onClick={nextMonth}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {MONTHS.map((m, i) => (
            <button key={i} onClick={() => setMonth(i+1)} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 7px', border: `1px solid ${month === i+1 ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--r)', background: month === i+1 ? 'var(--accent-dim)' : 'transparent', color: month === i+1 ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', transition: 'all .15s' }}>{m}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Laden…</div>
      ) : (
        <>
          <div className="grid2" style={{ gap: 9, marginBottom: 12 }}>
            {[
              { label: 'Gesamtstunden', val: `${stats?.total_hours || 0}h`, accent: true },
              { label: 'Arbeitstage',   val: `${stats?.working_days || 0}d` },
              { label: 'Ø pro Tag',     val: stats?.working_days > 0 ? `${Math.round(stats.total_hours/stats.working_days*10)/10}h` : '–' },
              { label: 'Projekte',      val: `${projData.length}` },
            ].map(({ label, val, accent }) => (
              <div key={label} style={{ background: 'var(--bg3)', border: `1px solid ${accent ? 'rgba(200,240,96,.2)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 13 }}>
                <div className="label" style={{ marginBottom: 5 }}>{label}</div>
                <div className="mono" style={{ fontSize: 22, color: accent ? 'var(--accent)' : 'var(--text)', letterSpacing: '-.02em' }}>{val}</div>
              </div>
            ))}
          </div>

          {projData.length > 0 && (
            <div className="card">
              <div className="label" style={{ marginBottom: 14 }}>Nach Projekt</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={projData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: '#555550', fontSize: 10, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, fontFamily: 'DM Mono', fontSize: 11, color: '#e8e4dc' }} formatter={(v) => [`${v}h`]} labelFormatter={() => ''} cursor={{ fill: 'rgba(200,240,96,.04)' }} />
                  <Bar dataKey="hours" radius={[3,3,0,0]}>
                    {projData.map((_, i) => <Cell key={i} fill={i === 0 ? '#c8f060' : `rgba(200,240,96,${Math.max(.5-i*.1,.15)})`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {projData.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: i === 0 ? '#c8f060' : `rgba(200,240,96,${Math.max(.5-i*.1,.15)})`, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12 }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{p.hours}h</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text3)', width: 30, textAlign: 'right' }}>{stats.total_hours > 0 ? Math.round(p.hours/stats.total_hours*100) : 0}%</div>
                    <div style={{ width: 52, height: 2, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${stats.total_hours > 0 ? p.hours/stats.total_hours*100 : 0}%`, background: i === 0 ? '#c8f060' : 'rgba(200,240,96,.4)', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats?.total_hours === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)', fontSize: 13 }}>Keine Einträge für {MONTHS[month-1]} {year}</div>
          )}
        </>
      )}
    </div>
  )
}
