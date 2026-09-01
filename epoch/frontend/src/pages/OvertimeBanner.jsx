import { getOvertimeInfo, fmtMinutes } from '../hooks/useTimer'

/**
 * Shows overtime / must-rebook banners for a given day total.
 * compact=true → single line tag (for use in cards/rows)
 * compact=false → full banner with explanation
 */
export default function OvertimeBanner({ totalMinutes, compact = false }) {
  const { overtime, mustRebook, level } = getOvertimeInfo(totalMinutes)
  if (level === 'none') return null

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 'var(--r)',
          background: level === 'rebook' ? 'var(--red-dim)' : 'var(--amber-dim)',
          color: level === 'rebook' ? 'var(--red)' : 'var(--amber)',
          whiteSpace: 'nowrap',
        }}>
          +{fmtMinutes(overtime)} ÜS
        </span>
        {level === 'rebook' && (
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 'var(--r)',
            background: 'var(--red-dim)',
            color: 'var(--red)',
            whiteSpace: 'nowrap',
          }}>
            ⚠ {fmtMinutes(mustRebook)} umbuchen
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {/* Overtime badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--amber-dim)',
        border: '1px solid rgba(255,170,0,.25)',
        borderRadius: 'var(--r)',
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⏱</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)', fontWeight: 500 }}>
            +{fmtMinutes(overtime)} Überstunden
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            Mehr als 8h gebucht
          </div>
        </div>
      </div>

      {/* Must-rebook warning */}
      {level === 'rebook' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'var(--red-dim)',
          border: '1px solid rgba(255,68,68,.3)',
          borderRadius: 'var(--r)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', fontWeight: 500 }}>
              {fmtMinutes(mustRebook)} müssen umgebucht werden
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              Mehr als 10h gebucht — Differenz auf anderen Tag verschieben
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
