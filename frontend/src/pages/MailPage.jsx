import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import { api } from '../api'

dayjs.locale('de')

export default function MailPage() {
  const [config, setConfig]       = useState(null)
  const [log, setLog]             = useState([])
  const [stats, setStats]         = useState(null)
  const [sendDay, setSendDay]     = useState(dayjs().format('YYYY-MM-DD'))
  const [recipient, setRecipient] = useState('')
  const [sending, setSending]     = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [polling, setPolling]     = useState(false)
  const [pollResult, setPollResult] = useState(null)

  const load = useCallback(() => {
    api.getMailConfig().then(setConfig).catch(() => {})
    api.getMailLog(30).then(setLog).catch(() => {})
    api.getMailStats().then(setStats).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const handleSendReport = async () => {
    setSending(true); setSendResult(null)
    try {
      const res = await api.sendReport({ day: sendDay, recipient: recipient || undefined })
      setSendResult({ ok: true, msg: res.message })
      load()
    } catch (e) {
      setSendResult({ ok: false, msg: e.message })
    } finally {
      setSending(false)
    }
  }

  const handlePoll = async () => {
    setPolling(true); setPollResult(null)
    try {
      await api.triggerPoll()
      setPollResult({ ok: true, msg: 'Postfach abgerufen' })
      setTimeout(() => { load(); setPollResult(null) }, 1500)
    } catch (e) {
      setPollResult({ ok: false, msg: e.message })
    } finally {
      setPolling(false)
    }
  }

  const smtpOk = config?.smtp?.configured
  const imapOk = config?.imap?.configured

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 3 }}>E-Mail</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>Mail</h1>
      </div>

      {/* Status cards */}
      <div className="grid2" style={{ marginBottom: 14 }}>
        <StatusCard label="SMTP" ok={smtpOk} detail={config?.smtp?.host || 'nicht konfiguriert'} />
        <StatusCard label="IMAP" ok={imapOk} detail={config?.imap?.host || 'nicht konfiguriert'} />
      </div>

      {/* Mail stats */}
      {stats && (
        <div className="grid2" style={{ marginBottom: 14 }}>
          <MiniStat label="Empfangen" value={stats.mails_received} />
          <MiniStat label="Geparst" value={stats.mails_parsed} />
          <MiniStat label="Gesendet" value={stats.mails_sent} />
          <MiniStat label="Einträge via Mail" value={stats.entries_via_email} accent />
        </div>
      )}

      {/* Send report */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 11 }}>Tagesreport senden</div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Tag</div>
            <input type="date" value={sendDay} onChange={e => setSendDay(e.target.value)} />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>Empfänger (optional)</div>
            <input type="email" placeholder={config?.smtp?.to || 'Standard aus .env'} value={recipient} onChange={e => setRecipient(e.target.value)} />
          </div>
        </div>
        {sendResult && (
          <div style={{ marginBottom: 10, padding: '8px 12px', background: sendResult.ok ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${sendResult.ok ? 'rgba(200,240,96,.3)' : 'var(--red)'}`, borderRadius: 'var(--r)', fontSize: 12, color: sendResult.ok ? 'var(--accent)' : 'var(--red)' }}>
            {sendResult.ok ? '✓ ' : '✗ '}{sendResult.msg}
          </div>
        )}
        <button
          className="btn btn-primary"
          onClick={handleSendReport}
          disabled={sending || !smtpOk}
          style={{ justifyContent: 'center' }}
        >
          {sending ? '…' : !smtpOk ? 'SMTP nicht konfiguriert' : '↑ Report senden'}
        </button>
      </div>

      {/* IMAP Poll */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 3 }}>Eingehende Mails</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 11, lineHeight: 1.6 }}>
          {imapOk
            ? `Automatisches Polling alle ${Math.round((config?.imap?.interval || 300) / 60)} Minuten. Ordner: ${config?.imap?.folder}`
            : 'IMAP nicht konfiguriert — Credentials in .env setzen.'}
        </div>
        {pollResult && (
          <div style={{ marginBottom: 10, padding: '8px 12px', background: pollResult.ok ? 'var(--accent-dim)' : 'var(--red-dim)', border: `1px solid ${pollResult.ok ? 'rgba(200,240,96,.3)' : 'var(--red)'}`, borderRadius: 'var(--r)', fontSize: 12, color: pollResult.ok ? 'var(--accent)' : 'var(--red)' }}>
            {pollResult.ok ? '✓ ' : '✗ '}{pollResult.msg}
          </div>
        )}
        <button
          className="btn btn-ghost w-full"
          style={{ justifyContent: 'center' }}
          onClick={handlePoll}
          disabled={polling || !imapOk}
        >
          {polling ? '…' : '↻ Jetzt abrufen'}
        </button>
      </div>

      {/* Format guide */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 11 }}>E-Mail Format</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.7 }}>
          Schicke eine E-Mail an <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{config?.imap?.user || 'deine-imap-adresse'}</strong>. Jede Zeile im Body wird als Zeiteintrag geparst:
        </div>
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 2 }}>
          <div><span style={{ color: 'var(--accent)' }}>09:00-10:30</span> Meeting Sprint Planning</div>
          <div><span style={{ color: 'var(--accent)' }}>10:45-13:15</span> Entwicklung Auth-System</div>
          <div><span style={{ color: 'var(--accent)' }}>14:00-15:00</span> Allgemein</div>
          <div style={{ marginTop: 8, color: 'var(--text-3)' }}># Mit explizitem Datum:</div>
          <div><span style={{ color: 'rgba(200,240,96,.6)' }}>2026-06-01</span> <span style={{ color: 'var(--accent)' }}>09:00-10:00</span> Planung Roadmap</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.8 }}>
          Projekte: <span style={{ fontFamily: 'var(--font-mono)' }}>Allgemein · Entwicklung · Meeting · Planung · Support · Dokumentation</span><br/>
          Das Datum der Mail wird verwendet, wenn kein explizites Datum angegeben ist.
        </div>
      </div>

      {/* Mail log */}
      {log.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 9 }}>Log</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {log.map(entry => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {log.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
          Noch keine Mail-Aktivität
        </div>
      )}
    </div>
  )
}

function StatusCard({ label, ok, detail }) {
  return (
    <div style={{ background: 'var(--bg-3)', border: `1px solid ${ok ? 'rgba(200,240,96,.2)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }} />
        <div className="label">{label}</div>
      </div>
      <div style={{ fontSize: 11, color: ok ? 'var(--accent)' : 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ok ? '● OK' : '○ nicht konfiguriert'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {detail}
      </div>
    </div>
  )
}

function MiniStat({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--bg-3)', border: `1px solid ${accent ? 'rgba(200,240,96,.2)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: '11px 13px' }}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, color: accent ? 'var(--accent)' : 'var(--text)', letterSpacing: '-.02em' }}>{value}</div>
    </div>
  )
}

function LogRow({ entry }) {
  const isIn = entry.direction === 'in'
  const isOk = entry.status === 'ok' || entry.status === 'parsed'
  const time = dayjs(entry.created_at + (entry.created_at.endsWith('Z') ? '' : 'Z')).format('DD.MM HH:mm')

  return (
    <div className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOk ? 'var(--accent)' : 'var(--red)', flexShrink: 0 }} />
      <div style={{ flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 2, background: isIn ? 'rgba(100,160,255,.12)' : 'var(--accent-dim)', color: isIn ? '#6699ff' : 'var(--accent)' }}>
          {isIn ? '↓ ein' : '↑ aus'}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.subject || '—'}</div>
        {entry.detail && <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.detail}</div>}
      </div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{time}</div>
    </div>
  )
}
