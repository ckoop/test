import { useState, useEffect, useRef } from 'react'

export function useTimer(startTime) {
  const [elapsed, setElapsed] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    const t = startTime.endsWith('Z') ? startTime : startTime + 'Z'
    const origin = new Date(t).getTime()
    const tick = () => { setElapsed(Date.now() - origin); raf.current = requestAnimationFrame(tick) }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [startTime])
  return elapsed
}

export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
}

export function fmtMinutes(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export function fmtTime(dt) {
  // dt is a UTC ISO string; display as local time
  const d = new Date((dt.endsWith('Z') ? dt : dt + 'Z'))
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ── Overtime thresholds ───────────────────────────────────────────────────────
export const WORK_DAY_MINUTES = 8 * 60    // 480 min
export const MAX_DAY_MINUTES  = 10 * 60   // 600 min

/**
 * Returns overtime info for a given day total.
 * @param {number} totalMinutes
 * @returns {{ overtime: number, mustRebook: number, level: 'none'|'overtime'|'rebook' }}
 */
export function getOvertimeInfo(totalMinutes) {
  if (totalMinutes <= WORK_DAY_MINUTES) return { overtime: 0, mustRebook: 0, level: 'none' }
  const overtime = totalMinutes - WORK_DAY_MINUTES
  if (totalMinutes <= MAX_DAY_MINUTES) return { overtime, mustRebook: 0, level: 'overtime' }
  const mustRebook = totalMinutes - MAX_DAY_MINUTES
  return { overtime, mustRebook, level: 'rebook' }
}
