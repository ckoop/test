import { useState, useEffect } from 'react'
import { api } from '../api'
import { useProjects, invalidateProjects } from '../hooks/useProjects'
import { useIdleThresholdMinutes, setIdleThresholdMinutes } from '../hooks/useIdleDetection'

const PRESET_COLORS = [
  '#c8f060', '#6699ff', '#ffaa00', '#ff4444',
  '#44bbff', '#ff88cc', '#88ffcc', '#ffcc44',
  '#aaaaaa', '#ff8844', '#bb88ff', '#44ffaa',
]

export default function SettingsPage() {
  const { projects, loading, refresh } = useProjects()
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState('#c8f060')
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState(null)
  const [editId, setEditId]     = useState(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true); setError(null)
    try {
      await api.createProject({ name: newName.trim(), color: newColor })
      setNewName(''); setNewColor('#c8f060')
      invalidateProjects()
    } catch (e) { setError(e.message) }
    finally { setCreating(false) }
  }

  const handleArchive = async (p) => {
    await api.updateProject(p.id, { active: p.active === 1 ? 0 : 1 }).catch(() => {})
    invalidateProjects()
  }

  const handleDelete = async (p) => {
    if (!confirm(`"${p.name}" wirklich löschen?`)) return
    try {
      await api.deleteProject(p.id)
      invalidateProjects()
    } catch (e) { setError(e.message) }
  }

  const handleColorChange = async (p, color) => {
    await api.updateProject(p.id, { color }).catch(() => {})
    invalidateProjects()
  }

  const handleRename = async (p, name) => {
    if (!name.trim() || name === p.name) { setEditId(null); return }
    try {
      await api.updateProject(p.id, { name: name.trim() })
      invalidateProjects()
    } catch (e) { setError(e.message) }
    finally { setEditId(null) }
  }

  const activeProjects   = projects.filter(p => p.active === 1)
  const archivedProjects = projects.filter(p => p.active === 0)

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 3 }}>Konfiguration</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>Einstellungen</h1>
      </div>

      {error && (
        <div style={{ padding: '9px 12px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--red)', marginBottom: 14 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      <PomodoroSettingsCard />
      <IdleSettingsCard />

      {/* ── New project ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 12 }}>Neues Projekt</div>

        {/* Color picker */}
        <div className="label" style={{ marginBottom: 7, fontSize: 9 }}>Farbe</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              style={{
                width: 26, height: 26, borderRadius: 'var(--r)',
                background: c, border: newColor === c ? '2px solid var(--text)' : '2px solid transparent',
                cursor: 'pointer', padding: 0, flexShrink: 0,
                boxShadow: newColor === c ? '0 0 0 1px var(--bg)' : 'none',
                transition: 'transform .1s',
                transform: newColor === c ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Projektname"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ flex: 1, marginBottom: 0 }}
          />
          <button
            className="btn btn-primary"
            style={{ padding: '10px 16px', width: 'auto', flexShrink: 0 }}
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            {creating ? '…' : '+ Hinzufügen'}
          </button>
        </div>
      </div>

      {/* ── Active projects ── */}
      <div className="label" style={{ marginBottom: 9 }}>Projekte ({activeProjects.length})</div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Laden…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {activeProjects.map(p => (
            <ProjectRow
              key={p.id}
              project={p}
              isEditing={editId === p.id}
              onEdit={() => setEditId(p.id)}
              onRename={(name) => handleRename(p, name)}
              onCancelEdit={() => setEditId(null)}
              onArchive={() => handleArchive(p)}
              onDelete={() => handleDelete(p)}
              onColorChange={(c) => handleColorChange(p, c)}
            />
          ))}
          {activeProjects.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
              Keine aktiven Projekte
            </div>
          )}
        </div>
      )}

      {/* ── Archived projects ── */}
      {archivedProjects.length > 0 && (
        <>
          <div className="label" style={{ marginBottom: 9 }}>Archiviert ({archivedProjects.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {archivedProjects.map(p => (
              <div key={p.id} className="card-sm flex items-center gap-3" style={{ opacity: .6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>{p.name}</div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 10, padding: '4px 10px' }}
                  onClick={() => handleArchive(p)}
                >
                  Wiederherstellen
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDelete(p)}
                  title="Löschen"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Info ── */}
      <div style={{ marginTop: 24, padding: '12px 14px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>Hinweis:</strong> Projekte die bereits in Einträgen verwendet werden, können nicht gelöscht — nur archiviert werden. Archivierte Projekte erscheinen nicht mehr in der Auswahl.
      </div>

      <DangerZoneCard />
    </div>
  )
}

function DangerZoneCard() {
  const CONFIRM_WORD = 'ZURUECKSETZEN'
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting]     = useState(false)
  const [error, setError]             = useState(null)

  const handleReset = async () => {
    if (confirmText !== CONFIRM_WORD) return
    if (!confirm('Wirklich ALLE Daten unwiderruflich löschen (Zeiteinträge, Tagesnotizen, Mail-Protokoll, Projekte) und auf den Auslieferungszustand zurücksetzen?')) return
    setResetting(true); setError(null)
    try {
      await api.resetDatabase()
      window.location.href = '/'   // voller Reload, damit App-weiter State (Timer, Pomodoro, Projekte) frisch geladen wird
    } catch (e) { setError(e.message); setResetting(false) }
  }

  return (
    <div className="card" style={{ marginTop: 24, borderColor: 'var(--red)' }}>
      <div className="label" style={{ marginBottom: 8, color: 'var(--red)' }}>Datenbank zurücksetzen</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.7 }}>
        Löscht <strong>alle</strong> Zeiteinträge, Tagesnotizen, Mail-Protokolle und Projekte und setzt die Datenbank auf den Auslieferungszustand zurück (6 Standard-Projekte, Pomodoro-Standardwerte). Die bestehende Datenbank wird vorher automatisch als Kopie gesichert.
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text3)' }}>
        Zum Bestätigen <strong style={{ color: 'var(--text)' }}>{CONFIRM_WORD}</strong> eingeben:
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder={CONFIRM_WORD}
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          style={{ flex: 1, marginBottom: 0 }}
        />
        <button
          className="btn btn-danger"
          style={{ width: 'auto', padding: '10px 16px', flexShrink: 0 }}
          onClick={handleReset}
          disabled={confirmText !== CONFIRM_WORD || resetting}
        >
          {resetting ? '…' : 'Zurücksetzen'}
        </button>
      </div>
    </div>
  )
}

function PomodoroSettingsCard() {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => { api.getPomodoroSettings().then(setSettings).catch(e => setError(e.message)) }, [])

  const update = (field, value) => setSettings(s => ({ ...s, [field]: value }))

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const updated = await api.updatePomodoroSettings(settings)
      if (updated.notifications_enabled && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
      window.location.href = '/'   // zurück zur Timer-Seite + Reload, damit der App-weite Pomodoro-State neu geladen wird
    } catch (e) { setError(e.message); setSaving(false) }
  }

  if (!settings) return null
  const enabled = !!settings.enabled

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>🍅 Pomodoro</div>
        <ToggleButton active={enabled} label={enabled ? 'Aktiviert' : 'Deaktiviert'} onClick={() => update('enabled', enabled ? 0 : 1)} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {enabled ? (
        <>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <NumberField label="Arbeitsdauer (min)" value={settings.work_minutes} onChange={v => update('work_minutes', v)} />
            <NumberField label="Zyklen bis lange Pause" value={settings.cycles_before_long_break} onChange={v => update('cycles_before_long_break', v)} />
            <NumberField label="Kurze Pause (min)" value={settings.short_break_minutes} onChange={v => update('short_break_minutes', v)} />
            <NumberField label="Lange Pause (min)" value={settings.long_break_minutes} onChange={v => update('long_break_minutes', v)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <ToggleButton active={!!settings.auto_start_next} label="Auto-Start nächste Phase" onClick={() => update('auto_start_next', settings.auto_start_next ? 0 : 1)} />
            <ToggleButton active={!!settings.sound_enabled} label="Ton" onClick={() => update('sound_enabled', settings.sound_enabled ? 0 : 1)} />
            <ToggleButton active={!!settings.notifications_enabled} label="Benachrichtigungen" onClick={() => update('notifications_enabled', settings.notifications_enabled ? 0 : 1)} />
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Deaktiviert — auf der Timer-Seite steht nur der normale Timer zur Verfügung.
        </div>
      )}
      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? '…' : '✓ Speichern'}
      </button>
    </div>
  )
}

function IdleSettingsCard() {
  const current = useIdleThresholdMinutes()
  const [draft, setDraft] = useState(current)

  useEffect(() => { setDraft(current) }, [current])

  const handleSave = () => {
    setIdleThresholdMinutes(draft)
    window.location.href = '/'   // zurück zur Timer-Seite + Reload
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="label" style={{ marginBottom: 12 }}>⏱ Idle-Erkennung</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
        Ab dieser Inaktivität (Rechner gesperrt, Tab/App im Hintergrund) wird beim Zurückkommen angeboten, die Zeit vom laufenden Timer abzuziehen. Gilt nur für dieses Gerät.
      </div>
      <div style={{ marginBottom: 14, maxWidth: 160 }}>
        <NumberField label="Schwelle (Min)" value={draft} onChange={setDraft} />
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={draft === current}>
        ✓ Speichern
      </button>
    </div>
  )
}

function NumberField({ label, value, onChange }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 5, fontSize: 9 }}>{label}</div>
      <input
        type="number"
        min={1}
        value={value}
        onChange={e => {
          const raw = e.target.value
          if (raw === '') { onChange(''); return }   // Feld darf beim Tippen kurz leer sein
          const n = parseInt(raw, 10)
          if (!Number.isNaN(n)) onChange(Math.max(1, n))
        }}
        onBlur={e => { if (e.target.value === '') onChange(1) }}
      />
    </div>
  )
}

function ToggleButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-ghost"
      style={{
        fontSize: 11, padding: '7px 12px',
        borderColor: active ? 'rgba(200,240,96,.4)' : 'var(--border2)',
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text2)',
      }}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  )
}

function ProjectRow({ project: p, isEditing, onEdit, onRename, onCancelEdit, onArchive, onDelete, onColorChange }) {
  const [editName, setEditName] = useState(p.name)
  const [showColors, setShowColors] = useState(false)

  return (
    <div className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="flex items-center gap-3">
        {/* Color dot — click to change */}
        <button
          onClick={() => setShowColors(v => !v)}
          style={{
            width: 14, height: 14, borderRadius: 3,
            background: p.color, flexShrink: 0,
            border: 'none', cursor: 'pointer',
            outline: showColors ? '2px solid var(--text)' : 'none',
            outlineOffset: 2,
          }}
          title="Farbe ändern"
        />

        {/* Name — click to rename */}
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onRename(editName)
              if (e.key === 'Escape') onCancelEdit()
            }}
            onBlur={() => onRename(editName)}
            style={{ flex: 1, fontSize: 13, padding: '4px 8px', marginBottom: 0 }}
          />
        ) : (
          <div
            style={{ flex: 1, fontSize: 13, cursor: 'pointer' }}
            onClick={onEdit}
            title="Klicken zum Umbenennen"
          >
            {p.name}
          </div>
        )}

        {/* Actions */}
        {!isEditing && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button className="btn-icon" onClick={onEdit} title="Umbenennen">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button className="btn-icon" onClick={onArchive} title="Archivieren">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </button>
            <button className="btn-icon" onClick={onDelete} title="Löschen" style={{ color: 'var(--text-3)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        )}
        {isEditing && (
          <button className="btn-icon" onClick={onCancelEdit} style={{ color: 'var(--text-3)' }}>✕</button>
        )}
      </div>

      {/* Inline color picker */}
      {showColors && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { onColorChange(c); setShowColors(false) }}
              style={{
                width: 22, height: 22, borderRadius: 'var(--r)',
                background: c, border: p.color === c ? '2px solid var(--text)' : '2px solid transparent',
                cursor: 'pointer', padding: 0,
                transform: p.color === c ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform .1s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
