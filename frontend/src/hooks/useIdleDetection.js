import { useState, useEffect, useRef, useCallback } from 'react'

// Schwelle ist pro Gerät konfigurierbar (localStorage) — macht Sinn, da auch die Erkennung
// selbst pro Gerät läuft (jedes Gerät beobachtet nur seinen eigenen Tab).
const STORAGE_KEY = 'epoch.idleThresholdMinutes'
const DEFAULT_IDLE_THRESHOLD_MINUTES = 3
const CHANGE_EVENT = 'epoch:idle-threshold-change'

function readThresholdMinutes() {
  const raw = Number(localStorage.getItem(STORAGE_KEY))
  return raw > 0 ? raw : DEFAULT_IDLE_THRESHOLD_MINUTES
}

export function setIdleThresholdMinutes(minutes) {
  localStorage.setItem(STORAGE_KEY, String(minutes))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

// Aktuelle Schwelle (Minuten) — aktualisiert sich live, wenn sie in den Settings geändert wird
export function useIdleThresholdMinutes() {
  const [minutes, setMinutes] = useState(readThresholdMinutes)
  useEffect(() => {
    const onChange = () => setMinutes(readThresholdMinutes())
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)   // Sync über mehrere Tabs desselben Geräts
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return minutes
}

/**
 * Erkennt Inaktivität über den Browser-Tab (Rechner gesperrt, Tab/App gewechselt): Zeitpunkt merken,
 * wenn der Tab unsichtbar wird ("hidden"), und beim Zurückkommen ("visible") die Lücke berechnen.
 * @param {boolean} active - ob gerade eine Zeiterfassung tatsächlich läuft (nicht pausiert)
 */
export function useIdleDetection(active) {
  const thresholdMinutes = useIdleThresholdMinutes()
  const [prompt, setPrompt] = useState(null)   // { since: timestamp, seconds } | null
  const hiddenAt = useRef(null)

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      if (hiddenAt.current == null) return
      const since = hiddenAt.current
      const idleSeconds = Math.round((Date.now() - since) / 1000)
      hiddenAt.current = null
      if (active && idleSeconds >= thresholdMinutes * 60) setPrompt({ since, seconds: idleSeconds })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [active, thresholdMinutes])

  const dismiss = useCallback(() => setPrompt(null), [])

  return { prompt, dismiss }
}
