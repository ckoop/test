import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'

const PHASE_LABELS = { work: 'Arbeit', short_break: 'Kurze Pause', long_break: 'Lange Pause' }

function beep(freq, duration) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration / 1000 + 0.05)
    osc.onended = () => ctx.close()
  } catch { /* Web Audio nicht verfügbar — Ton wird stillschweigend übersprungen */ }
}

function playPhaseSound(phase) {
  if (phase === 'work') { beep(880, 160); setTimeout(() => beep(880, 160), 200) }
  else { beep(660, 200) }
}

function notifyPhaseChange(phase) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification('Epoch — Pomodoro', { body: `${PHASE_LABELS[phase] || phase} beginnt` })
}

export function usePomodoro() {
  const [state, setState]   = useState(null)
  const [settings, setSettings] = useState(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const settingsRef = useRef(null)
  const prevPhase    = useRef(undefined)   // undefined = noch nicht geladen
  const raf          = useRef(null)

  useEffect(() => { settingsRef.current = settings }, [settings])

  const loadSettings = useCallback(() => {
    api.getPomodoroSettings().then(setSettings).catch(() => {})
  }, [])

  const load = useCallback(() => {
    api.getPomodoroActive().then(s => {
      if (prevPhase.current !== undefined && prevPhase.current !== s.phase && s.phase) {
        const cfg = settingsRef.current
        if (!cfg || cfg.sound_enabled) playPhaseSound(s.phase)
        if (!cfg || cfg.notifications_enabled) notifyPhaseChange(s.phase)
      }
      prevPhase.current = s.phase
      setState(s)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadSettings()
    load()
    const interval = setInterval(load, 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', load)
    }
  }, [load, loadSettings])

  // Countdown
  useEffect(() => {
    if (!state?.phase || state.awaiting_confirmation || !state.phase_start) {
      setRemainingMs(0)
      return
    }
    const origin  = new Date((state.phase_start.endsWith('Z') ? state.phase_start : state.phase_start + 'Z')).getTime()
    const totalMs = state.phase_duration_seconds * 1000
    const tick = () => {
      setRemainingMs(Math.max(0, origin + totalMs - Date.now()))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [state?.phase, state?.phase_start, state?.phase_duration_seconds, state?.awaiting_confirmation])

  const start = useCallback((data) => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    return api.startPomodoro(data).then(load)
  }, [load])
  const skip           = useCallback(() => api.skipPomodoro().then(load), [load])
  const continueSession = useCallback(() => api.continuePomodoro().then(load), [load])
  const stop            = useCallback(() => api.stopPomodoro().then(load), [load])

  return { state, settings, remainingMs, start, skip, continueSession, stop, refreshSettings: loadSettings }
}

export const POMODORO_PHASE_LABELS = PHASE_LABELS
