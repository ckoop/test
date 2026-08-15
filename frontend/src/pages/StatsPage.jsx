import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api } from '../api'
import { fmtMinutes, getOvertimeInfo, WORK_DAY_MINUTES } from '../hooks/useTimer'

dayjs.locale('de')
export const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

export default function StatsPage({ year, month, setYear, setMonth }) {
  const [stats, setStats] = useState(null)
  const [entries, setEntries] = useState([])
  const [projectColors, setProjectColors] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState(null)
  const [overtimeView, setOvertimeView] = useState('day') // 'day' | 'project'

  useEffect(() => {
    setLoading(true)
    setSelectedProject(null)
    const fd = dayjs(`${year}-${String(month).padStart(2,'0')}-01`)
    const td = fd.endOf('month')
    Promise.all([
      api.getMonthlyStats(year, month),
      api.getEntries({ from_date: fd.format('YYYY-MM-DD'), to_date: td.format('YYYY-MM-DD') }),
      api.getProjects(true), // inkl. archivierte, da alte Einträge sie noch referenzieren können
    ]).then(([s, e, projects]) => {
      setStats(s); setEntries(e)
      setProjectColors(Object.fromEntries(projects.map(p => [p.name, p.color])))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [year, month])

  const toggleProject = (name) => setSelectedProject(sp => sp === name ? null : name)

  const projData = stats ? Object.entries(stats.by_project).map(([name, mins]) => ({ name, hours: Math.round(mins/60*10)/10, mins })).sort((a,b) => b.mins - a.mins) : []

  const finishedEntries = entries.filter(e => e.end_time)
  const scopedEntries = selectedProject ? finishedEntries.filter(e => e.project === selectedProject) : finishedEntries
  const scopedTotalMin = scopedEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0)
  const scopedTotalHours = Math.round(scopedTotalMin / 60 * 10) / 10
  const scopedWorkingDays = new Set(scopedEntries.map(e => e.date)).size

  const dayTotals = finishedEntries.reduce((acc, e) => {
    acc[e.date] = (acc[e.date] || 0) + (e.duration_minutes || 0)
    return acc
  }, {})
  const overtimeDays = Object.entries(dayTotals)
    .map(([date, mins]) => ({ date, mins, ...getOvertimeInfo(mins) }))
    .filter(d => d.level !== 'none')
    .sort((a, b) => b.date.localeCompare(a.date))
  const totalOvertimeMin = overtimeDays.reduce((s, d) => s + d.overtime, 0)
  const totalRebookMin   = overtimeDays.reduce((s, d) => s + d.mustRebook, 0)

  // Projektüberstunden: zählt nur, wenn ein einzelnes Projekt an einem Tag
  // für sich genommen mehr als 8h gebucht hat (nicht anteilig an der Tagesüberstunde).
  const overtimeByProject = (() => {
    const dayProjectMin = {}
    finishedEntries.forEach(e => {
      const p = e.project || 'Allgemein'
      dayProjectMin[e.date] = dayProjectMin[e.date] || {}
      dayProjectMin[e.date][p] = (dayProjectMin[e.date][p] || 0) + (e.duration_minutes || 0)
    })
    const acc = {}
    Object.entries(dayProjectMin).forEach(([date, projMins]) => {
      Object.entries(projMins).forEach(([p, mins]) => {
        if (mins > WORK_DAY_MINUTES) {
          const overtime = mins - WORK_DAY_MINUTES
          if (!acc[p]) acc[p] = { mins: 0, days: [] }
          acc[p].mins += overtime
          acc[p].days.push({ date, overtime })
        }
      })
    })
    return Object.entries(acc)
      .map(([name, v]) => ({ name, mins: v.mins, days: v.days.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => b.mins - a.mins)
  })()
  const totalProjectOvertimeMin = overtimeByProject.reduce((s, p) => s + p.mins, 0)
  const projectOvertimeDayCount = new Set(overtimeByProject.flatMap(p => p.days.map(d => d.date))).size

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
          {selectedProject && (
            <div className="flex items-center gap-2" style={{ marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text2)' }}>Gefiltert nach Projekt:</span>
              <span className="tag tag-g">{selectedProject}</span>
              <button className="btn-icon" onClick={() => setSelectedProject(null)} title="Filter zurücksetzen">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          <div className="grid2" style={{ gap: 9, marginBottom: 12 }}>
            {[
              { label: 'Gesamtstunden', val: `${selectedProject ? scopedTotalHours : (stats?.total_hours || 0)}h`, accent: true },
              { label: 'Arbeitstage',   val: `${selectedProject ? scopedWorkingDays : (stats?.working_days || 0)}d` },
              { label: 'Ø pro Tag',     val: (selectedProject ? scopedWorkingDays : stats?.working_days) > 0 ? `${Math.round((selectedProject ? scopedTotalHours : stats.total_hours)/(selectedProject ? scopedWorkingDays : stats.working_days)*10)/10}h` : '–' },
              { label: 'Projekte',      val: `${projData.length}` },
            ].map(({ label, val, accent }) => (
              <div key={label} style={{ background: 'var(--bg3)', border: `1px solid ${accent ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 13 }}>
                <div className="label" style={{ marginBottom: 5 }}>{label}</div>
                <div className="mono" style={{ fontSize: 22, color: accent ? 'var(--accent)' : 'var(--text)', letterSpacing: '-.02em' }}>{val}</div>
              </div>
            ))}
          </div>

          {projData.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                <div className="label">Nach Projekt</div>
                <div className="label" style={{ color: 'var(--text3)' }}>Balken anklicken zum Filtern</div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={projData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }} formatter={(v) => [`${v}h`]} labelFormatter={() => ''} cursor={{ fill: 'color-mix(in srgb, var(--accent) 4%, transparent)' }} />
                  <Bar dataKey="hours" radius={[3,3,0,0]}>
                    {projData.map((p, i) => (
                      <Cell
                        key={i}
                        cursor="pointer"
                        onClick={() => toggleProject(p.name)}
                        fill={projectColors[p.name] || 'var(--text3)'}
                        fillOpacity={selectedProject ? (p.name === selectedProject ? 1 : .25) : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {projData.map((p) => {
                  const isSelected = p.name === selectedProject
                  const dotColor = projectColors[p.name] || 'var(--text3)'
                  return (
                    <div
                      key={p.name}
                      className="flex items-center gap-2"
                      onClick={() => toggleProject(p.name)}
                      style={{
                        cursor: 'pointer', padding: '3px 6px', marginLeft: -6, marginRight: -6, borderRadius: 'var(--r)',
                        background: isSelected ? 'var(--accent-dim)' : 'transparent',
                        opacity: selectedProject && !isSelected ? .5 : 1,
                      }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: dotColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12, fontWeight: isSelected ? 700 : 400 }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{p.hours}h</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text3)', width: 30, textAlign: 'right' }}>{stats.total_hours > 0 ? Math.round(p.hours/stats.total_hours*100) : 0}%</div>
                      <div style={{ width: 52, height: 2, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ height: '100%', width: `${stats.total_hours > 0 ? p.hours/stats.total_hours*100 : 0}%`, background: projectColors[p.name] || 'var(--text3)', borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {stats?.total_hours === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)', fontSize: 13 }}>Keine Einträge für {MONTHS[month-1]} {year}</div>
          )}

          {overtimeDays.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                <div className="label">Überstunden</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ key: 'day', label: 'Pro Tag' }, { key: 'project', label: 'Pro Projekt' }].map(o => (
                    <button
                      key={o.key}
                      onClick={() => setOvertimeView(o.key)}
                      style={{
                        fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 7px',
                        border: `1px solid ${overtimeView === o.key ? 'var(--amber)' : 'var(--border)'}`,
                        borderRadius: 'var(--r)',
                        background: overtimeView === o.key ? 'var(--amber-dim)' : 'transparent',
                        color: overtimeView === o.key ? 'var(--amber)' : 'var(--text3)',
                        cursor: 'pointer', transition: 'all .15s',
                      }}
                    >{o.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid2" style={{ gap: 9, marginBottom: 14 }}>
                <div style={{ background: 'var(--bg3)', border: '1px solid rgba(255,170,0,.2)', borderRadius: 'var(--r)', padding: 13 }}>
                  <div className="label" style={{ marginBottom: 5 }}>Gesamt</div>
                  <div className="mono" style={{ fontSize: 22, color: 'var(--amber)', letterSpacing: '-.02em' }}>+{fmtMinutes(overtimeView === 'project' ? totalProjectOvertimeMin : totalOvertimeMin)}</div>
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 13 }}>
                  <div className="label" style={{ marginBottom: 5 }}>Tage mit ÜS</div>
                  <div className="mono" style={{ fontSize: 22, color: 'var(--text)', letterSpacing: '-.02em' }}>{overtimeView === 'project' ? projectOvertimeDayCount : overtimeDays.length}</div>
                </div>
              </div>
              {overtimeView === 'day' && totalRebookMin > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: 'var(--red-dim)', border: '1px solid rgba(255,68,68,.3)',
                  borderRadius: 'var(--r)', marginBottom: 14,
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', fontWeight: 500 }}>
                    {fmtMinutes(totalRebookMin)} sollten umgebucht werden ({overtimeDays.filter(d => d.level === 'rebook').length} {overtimeDays.filter(d => d.level === 'rebook').length === 1 ? 'Tag' : 'Tage'} &gt; 10h)
                  </div>
                </div>
              )}
              {overtimeView === 'day' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {overtimeDays.map(d => (
                    <div key={d.date} className="flex items-center justify-between" style={{ fontSize: 12 }}>
                      <div className="mono" style={{ color: 'var(--text2)' }}>{dayjs(d.date).format('ddd, D. MMM')}</div>
                      <div className="flex items-center gap-2">
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtMinutes(d.mins)} gesamt</span>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 6px', borderRadius: 'var(--r)',
                          background: d.level === 'rebook' ? 'var(--red-dim)' : 'var(--amber-dim)',
                          color: d.level === 'rebook' ? 'var(--red)' : 'var(--amber)',
                        }}>+{fmtMinutes(d.overtime)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="label" style={{ marginBottom: -6, color: 'var(--text3)' }}>Zählt nur Tage, an denen das Projekt allein mehr als 8h gebucht wurde</div>
                  {overtimeByProject.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Kein Projekt hat an einem Tag allein mehr als 8h erreicht.</div>
                  ) : overtimeByProject.map(p => (
                    <div key={p.name}>
                      <div className="flex items-center gap-2">
                        <div style={{ flex: 1, fontSize: 12 }}>{p.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>+{fmtMinutes(p.mins)}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
                        {p.days.map(d => (
                          <div key={d.date} className="flex items-center justify-between" style={{ fontSize: 11 }}>
                            <div className="mono" style={{ color: 'var(--text3)' }}>{dayjs(d.date).format('ddd, D. MMM')}</div>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>+{fmtMinutes(d.overtime)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
