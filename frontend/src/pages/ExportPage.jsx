import { useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/de'

dayjs.locale('de')

const PRESETS = [
  { label: 'Diese Woche',    from: () => dayjs().startOf('isoWeek').format('YYYY-MM-DD'),                  to: () => dayjs().format('YYYY-MM-DD') },
  { label: 'Dieser Monat',   from: () => dayjs().startOf('month').format('YYYY-MM-DD'),                    to: () => dayjs().format('YYYY-MM-DD') },
  { label: 'Letzter Monat',  from: () => dayjs().subtract(1,'month').startOf('month').format('YYYY-MM-DD'),to: () => dayjs().subtract(1,'month').endOf('month').format('YYYY-MM-DD') },
  { label: 'Letzte 30 Tage', from: () => dayjs().subtract(30,'day').format('YYYY-MM-DD'),                  to: () => dayjs().format('YYYY-MM-DD') },
  { label: 'Dieses Jahr',    from: () => dayjs().startOf('year').format('YYYY-MM-DD'),                     to: () => dayjs().format('YYYY-MM-DD') },
  { label: 'Alles',          from: () => '2020-01-01',                                                     to: () => dayjs().format('YYYY-MM-DD') },
]

export default function ExportPage() {
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [to, setTo]     = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(null)
  const [done, setDone]       = useState(null)

  const download = async (fmt) => {
    setLoading(fmt); setDone(null)
    try {
      const params = new URLSearchParams({ from_date: from, to_date: to })
      const res = await fetch(`/api/export/${fmt}?${params}`)
      if (!res.ok) throw new Error('Export fehlgeschlagen')
      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') || ''
      const name = (cd.match(/filename="(.+)"/) || [])[1] || `export.${fmt}`
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDone(fmt); setTimeout(() => setDone(null), 3000)
    } catch (e) { alert(e.message) }
    finally { setLoading(null) }
  }

  const fmtLabel = (s) => dayjs(s).format('D. MMM YYYY')

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 3 }}>Daten</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>Export</h1>
      </div>

      {/* Range picker */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 10 }}>Zeitraum</div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Von</div>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Bis</div>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {PRESETS.map(p => (
            <button key={p.label} className="btn btn-ghost" onClick={() => { setFrom(p.from()); setTo(p.to()) }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Range label */}
      <div style={{ padding: '9px 12px', background: 'var(--accent-dim2)', border: '1px solid rgba(200,240,96,.12)', borderRadius: 'var(--r)', marginBottom: 18, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
        {fmtLabel(from)} → {fmtLabel(to)}
      </div>

      <div className="label" style={{ marginBottom: 9 }}>Format wählen</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <ExportCard
          title="CSV" subtitle="Kompatibel mit Excel, Numbers, LibreOffice"
          note="Semikolon-getrennt · UTF-8 BOM"
          icon={<IcoFile />}
          loading={loading === 'csv'} done={done === 'csv'}
          onExport={() => download('csv')}
        />
        <ExportCard
          title="JSON" subtitle="Maschinenlesbar · inkl. Tagesnotizen & Zusammenfassung"
          note="ISO 8601 · UTF-8"
          icon={<IcoCode />}
          loading={loading === 'json'} done={done === 'json'}
          onExport={() => download('json')}
        />
      </div>

      <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>Hinweis:</strong> Exportiert werden alle abgeschlossenen Einträge im gewählten Zeitraum — sowohl per Timer erfasste als auch manuell eingetragene.
      </div>
    </div>
  )
}

function ExportCard({ title, subtitle, note, icon, loading, done, onExport }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', background: 'var(--bg2)', border: `1px solid ${done ? 'rgba(200,240,96,.3)' : 'var(--border)'}`, borderRadius: 'var(--rl)', transition: 'border-color .3s' }}>
      <div style={{ width: 38, height: 38, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? 'var(--accent)' : 'var(--text2)' }}>
        {done ? <IcoDone /> : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: done ? 'var(--accent)' : 'var(--text)' }}>{done ? '✓ Heruntergeladen' : title}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{subtitle}</div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{note}</div>
      </div>
      <button onClick={onExport} disabled={loading || done} style={{ fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', padding: '9px 14px', border: 'none', borderRadius: 'var(--r)', cursor: loading || done ? 'not-allowed' : 'pointer', background: done ? 'var(--accent-dim)' : 'var(--accent)', color: done ? 'var(--accent)' : '#0a0a0a', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, opacity: done ? .7 : 1, transition: 'all .15s' }}>
        {loading
          ? <span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,.2)', borderTopColor: '#0a0a0a', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        }
        ↓
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function IcoFile() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg> }
function IcoCode() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function IcoDone() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> }
