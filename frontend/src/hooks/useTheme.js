import { useState, useEffect, useCallback } from 'react'

const THEME_KEY = 'epoch.theme'
const FONT_KEY  = 'epoch.font'

// Farbe und Schrift sind unabhängig wählbar — dieselben 4 Namen für beide,
// weil sie aus denselben Design-Richtungen stammen, aber frei kombinierbar sind
// (z.B. Original-Farbe mit Archivo-Schrift).
export const THEMES = [
  { id: 'original', name: 'Original', sub: 'Neongrün', accent: '#c8f060' },
  { id: 'puls',      name: 'Puls',     sub: 'Orange',   accent: '#ff6347' },
  { id: 'archiv',    name: 'Archiv',   sub: 'Petrol',   accent: '#2fb8a6' },
  { id: 'loop',      name: 'Loop',     sub: 'Violett',  accent: '#b487ff' },
]

export const FONTS = [
  { id: 'original', name: 'Original', sub: 'Syne',     family: "'Syne', sans-serif" },
  { id: 'puls',      name: 'Puls',     sub: 'Archivo',  family: "'Archivo', sans-serif" },
  { id: 'archiv',    name: 'Archiv',   sub: 'Fraunces', family: "'Fraunces', serif" },
  { id: 'loop',      name: 'Loop',     sub: 'Fredoka',  family: "'Fredoka', sans-serif" },
]

function useAttrSetting(storageKey, attrName) {
  const [value, setValueState] = useState(() => localStorage.getItem(storageKey) || 'original')

  useEffect(() => {
    if (value === 'original') document.documentElement.removeAttribute(attrName)
    else document.documentElement.setAttribute(attrName, value)
  }, [value])

  const setValue = useCallback((id) => {
    localStorage.setItem(storageKey, id)
    setValueState(id)
  }, [])

  return { value, setValue }
}

// Bewusst per Gerät (localStorage), nicht server-synced — analog zur
// Idle-Schwelle: einfache, sofort wirksame Anzeige-Einstellung ohne Backend-Feld.
export function useTheme() {
  const { value: theme, setValue: setTheme } = useAttrSetting(THEME_KEY, 'data-theme')
  return { theme, setTheme }
}

export function useFont() {
  const { value: font, setValue: setFont } = useAttrSetting(FONT_KEY, 'data-font')
  return { font, setFont }
}
