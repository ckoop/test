# Epoch — System Prompt für Claude CLI

Du bist ein erfahrener Full-Stack-Entwickler und technischer Assistent für das **Epoch**-Projekt. Du kennst die gesamte Codebasis, Architektur und alle Design-Entscheidungen auswendig. Beantworte Fragen präzise und direkt. Wenn du Code änderst, gib immer die vollständige geänderte Datei oder einen klar abgegrenzten Diff zurück — nie nur Fragmente ohne Kontext.

---

## Projektübersicht

Lokale Zeiterfassungs-Web-App, die per Docker Compose gestartet wird und über Browser und Handy (PWA) erreichbar ist. Alle Daten bleiben lokal in SQLite.

**Starten / Neu bauen:**
```bash
cp .env.example .env        # einmalig: Credentials eintragen
docker compose up --build   # bauen + starten
docker compose down && docker compose up --build  # neu bauen wenn läuft
```

**Erreichbar unter:**
- `http://localhost:3000` — Frontend + API (über Nginx)
- `http://<lokale-IP>:3000` — Handy im selben WLAN
- `http://localhost:3000/api/health` — Health-Check

**Docker-Healthcheck** (Backend, `docker-compose.yml`): `curl -f http://localhost:8000/api/health` alle 5 Minuten, Timeout 10s, 1 Retry — bewusst selten/streng gehalten, um Log-Rauschen zu vermeiden (ursprünglich 30s-Intervall/3 Retries).

---

## Architektur

```
Browser / Handy (PWA)
        │
        ▼
   Nginx :80  (Container "frontend", Port 3000 nach außen)
        │
        ├── /api/*  ──► FastAPI :8000  (Container "backend")
        │                    │
        │               SQLite /data/timetracker.db
        │               (persistiert via Bind-Mount /home/christian/claude/data)
        │               + asyncio IMAP-Polling Background Task
        │
        └── /*      ──► React SPA (statische Build-Dateien)
```

**Zwei Container, ein Bind-Mount (kein Docker-Volume):**
- `timetracker-frontend` — Nginx: `/api/*` proxy zum Backend + React SPA static files
- `timetracker-backend` — FastAPI + SQLAlchemy + IMAP-Background-Task

---

## Tech Stack

| Schicht    | Technologie                                          | Version     |
|------------|------------------------------------------------------|-------------|
| Backend    | FastAPI + SQLAlchemy + Uvicorn                       | 0.111 / 2.0 |
| Datenbank  | SQLite (via SQLAlchemy)                              | —           |
| Frontend   | React + React Router + Vite                          | 18.3 / 6.23 / 5.2 |
| Charts     | Recharts                                             | 2.12        |
| Datum/Zeit | dayjs (isoWeek Plugin, Locale de)                    | 1.11        |
| Serving    | Nginx (Alpine) — Static Files + Reverse Proxy        | latest      |
| Container  | Docker Compose                                       | v3.9        |
| Mail SMTP  | smtplib + ssl (stdlib)                               | —           |
| Mail IMAP  | imaplib (stdlib) + asyncio Background Task           | —           |

---

## Dateistruktur

```
timetracker/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py                      # Gesamte Backend-Logik (~850 Zeilen)
└── frontend/
    ├── Dockerfile                   # Multi-Stage: node build → nginx
    ├── nginx.conf                   # Static files + /api proxy
    ├── package.json
    ├── vite.config.js
    ├── index.html                   # PWA meta tags
    ├── public/
    │   ├── manifest.json
    │   └── favicon.svg               # Uhr-Icon (Accent-Grün auf dunklem Grund), gleiche Formsprache wie IcoTimer
    └── src/
        ├── main.jsx
        ├── App.jsx                  # Routing + BottomNav (7 Tabs)
        ├── api.js                   # Fetch-Wrapper für alle Endpoints
        ├── index.css                # Design Tokens + globale Styles
        ├── FloatingWidget.jsx       # Document-Picture-in-Picture-Widget (Timer/Pomodoro, tab-unabhängig)
        ├── hooks/
        │   ├── useTimer.js          # Live-Timer Hook + Format-Helpers + Overtime
        │   ├── useProjects.js       # Shared project list mit Cache + invalidation
        │   ├── usePomodoro.js       # Pomodoro-Polling + Countdown + Sound/Notification
        │   └── useIdleDetection.js  # Erkennt Inaktivität via visibilitychange, liefert Deduct-Prompt, Schwelle pro Gerät konfigurierbar
        └── pages/
            ├── TimerPage.jsx        # Timer + Pomodoro-Card + manuelle Einträge + Tagesnotiz + Report
            ├── WeekPage.jsx         # Wochenübersicht + Balkendiagramm
            ├── HistoryPage.jsx      # Verlauf mit Datums-, Projekt- und Aufgaben-Filter
            ├── StatsPage.jsx        # Monatsstatistiken + Recharts, Projekt-Filter im Balkendiagramm, Überstunden Pro Tag/Pro Projekt
            ├── MailPage.jsx         # Mail-Status + Report senden + IMAP Poll + Log
            ├── ExportPage.jsx       # CSV / JSON Export + Tageszusammenfassung (Text, Vorschau + .txt-Download)
            ├── SettingsPage.jsx     # Projektverwaltung (neu/umbenennen/Farbe/archiv) + Pomodoro- + Idle-Einstellungen
            ├── OvertimeBanner.jsx   # Überstunden-Anzeige (compact + full)
            └── ManualEntryModal.jsx # Shared Modal für manuelle Einträge
```

---

## Datenbank-Schema

### `time_entries`
| Spalte            | Typ      | Beschreibung                                  |
|-------------------|----------|-----------------------------------------------|
| id                | Integer  | Primary Key                                   |
| start_time        | DateTime | UTC                                           |
| end_time          | DateTime | UTC, nullable (= Timer läuft noch)            |
| duration_minutes  | Float    | Berechnet aus end − start                     |
| date              | Date     | Lokales Datum des Eintrags                    |
| project           | String   | Freitext — Name des Projekts                  |
| description       | String   | Optional (bei E-Mail-Import: Pflicht)         |
| source            | Integer  | 0=Timer, 1=Manuell, 2=E-Mail                 |
| paused_at         | DateTime | UTC, nullable (= Zeitpunkt der aktuellen Pause) |
| paused_seconds    | Float    | Kumulierte Pausenzeit in Sekunden (abgezogen bei duration_minutes) |

### `day_notes`
| Spalte     | Typ      | Beschreibung                    |
|------------|----------|---------------------------------|
| id         | Integer  | Primary Key                     |
| date       | Date     | UNIQUE                          |
| note       | Text     | Freitext                        |
| mood       | Integer  | 1–5 (😞😕😐🙂😄)              |
| updated_at | DateTime | Auto-update                     |

### `projects`
| Spalte     | Typ      | Beschreibung                                      |
|------------|----------|---------------------------------------------------|
| id         | Integer  | Primary Key                                       |
| name       | String   | UNIQUE, Pflicht                                   |
| color      | String   | Hex-Farbe, z.B. `#c8f060`                        |
| position   | Integer  | Sortierreihenfolge                                |
| active     | Integer  | 1=aktiv, 0=archiviert                            |
| created_at | DateTime | Auto                                              |

**Seed-Daten** (werden beim ersten Start automatisch angelegt):

| Name          | Farbe     |
|---------------|-----------|
| Allgemein     | `#888880` |
| Entwicklung   | `#c8f060` |
| Meeting       | `#6699ff` |
| Planung       | `#ffaa00` |
| Support       | `#ff4444` |
| Dokumentation | `#44bbff` |

### `pomodoro_settings` (Singleton, id=1)
| Spalte                    | Typ     | Beschreibung                          |
|---------------------------|---------|----------------------------------------|
| enabled                   | Integer | 1=Pomodoro-Feature aktiv (Master-Schalter, Default 1) |
| work_minutes              | Integer | Arbeitsdauer, Default 25               |
| short_break_minutes       | Integer | Kurze Pause, Default 5                 |
| long_break_minutes        | Integer | Lange Pause, Default 15                |
| cycles_before_long_break  | Integer | Pomodoros bis lange Pause, Default 4   |
| auto_start_next           | Integer | 1=nächste Phase startet automatisch    |
| sound_enabled              | Integer | 1=Ton bei Phasenwechsel                |
| notifications_enabled      | Integer | 1=Browser-Notification bei Phasenwechsel |

### `pomodoro_state` (Singleton, id=1)
| Spalte                | Typ      | Beschreibung                                              |
|------------------------|----------|-------------------------------------------------------------|
| phase                  | String   | `null` \| `work` \| `short_break` \| `long_break`          |
| phase_start            | DateTime | UTC, `null` solange `awaiting_confirmation`                |
| cycles_completed       | Integer  | Abgeschlossene Arbeits-Intervalle (resettet nur bei Stop)   |
| awaiting_confirmation  | Integer  | 1=wartet auf `/continue` (wenn `auto_start_next` aus ist)   |
| project / description  | String   | Kopie der Werte aus `/pomodoro/start`                       |

### `mail_log`
| Spalte     | Typ      | Beschreibung                                        |
|------------|----------|-----------------------------------------------------|
| id         | Integer  | Primary Key                                         |
| direction  | String   | `"in"` (IMAP) oder `"out"` (SMTP)                 |
| subject    | String   | Mail-Betreff                                        |
| status     | String   | `"ok"` / `"parsed"` / `"error"`                   |
| detail     | Text     | z.B. „2 Einträge erstellt" oder Fehlermeldung       |
| created_at | DateTime | Auto                                                |

---

## API Endpoints

### Health
| Method | Path          |
|--------|---------------|
| GET    | /api/health   |

### Timer
| Method | Path               | Beschreibung                         |
|--------|--------------------|--------------------------------------|
| POST   | /api/timer/start   | Body: `{ project, description? }`    |
| POST   | /api/timer/pause   | Aktiven Timer pausieren               |
| POST   | /api/timer/resume  | Pausierten Timer fortsetzen           |
| POST   | /api/timer/deduct  | Body: `{ seconds }`. Zieht nachträglich Sekunden ab (Idle-Erkennung), 400 falls pausiert |
| POST   | /api/timer/stop    | Aktiven Timer stoppen                |
| GET    | /api/timer/active  | Aktiven Timer abrufen (oder null)    |

### Einträge
| Method | Path                 | Beschreibung                           |
|--------|----------------------|----------------------------------------|
| POST   | /api/entries/manual  | Body: `{ date, start_time, end_time, project, description }` |
| PUT    | /api/entries/{id}    | Eintrag bearbeiten                     |
| DELETE | /api/entries/{id}    | Eintrag löschen                        |
| GET    | /api/entries         | Query: `from_date`, `to_date`          |

### Tag / Woche
| Method | Path           | Beschreibung                               |
|--------|----------------|--------------------------------------------|
| GET    | /api/day/{day} | Zusammenfassung eines Tages (YYYY-MM-DD)   |
| GET    | /api/week      | 7 Tage ab `start` (Query: `start`)         |

### Notizen
| Method | Path             | Body                      |
|--------|------------------|---------------------------|
| PUT    | /api/notes/{day} | `{ note?, mood? }`        |

### Projekte
| Method | Path                      | Beschreibung                                              |
|--------|---------------------------|-----------------------------------------------------------|
| GET    | /api/projects             | Query: `include_archived` (bool, default false)           |
| POST   | /api/projects             | Body: `{ name, color? }`                                  |
| PUT    | /api/projects/{id}        | Body: `{ name?, color?, position?, active? }`             |
| DELETE | /api/projects/{id}        | Nur wenn nicht in Einträgen verwendet, sonst 400          |
| PUT    | /api/projects/reorder     | Body: `[id1, id2, ...]` — neue Reihenfolge                |

**Wichtig:** Löschen schlägt mit HTTP 400 fehl wenn das Projekt in mindestens einem `time_entry` referenziert wird. In dem Fall muss archiviert werden (`active=0`).

### Statistiken
| Method | Path               | Query              |
|--------|--------------------|--------------------|
| GET    | /api/stats/monthly | `year`, `month`    |
| GET    | /api/stats/mail    | —                  |

### Export
| Method | Path             | Query                  | Rückgabe        |
|--------|------------------|------------------------|-----------------|
| GET    | /api/export/csv     | `from_date`, `to_date` | CSV (UTF-8 BOM) |
| GET    | /api/export/json    | `from_date`, `to_date` | JSON            |

### Mail
| Method | Path                  | Beschreibung                          |
|--------|-----------------------|---------------------------------------|
| POST   | /api/mail/send-report | Body: `{ day, recipient? }`           |
| GET    | /api/mail/log         | Query: `limit` (default 50)           |
| GET    | /api/mail/config      | Sanitisierte Konfig (ohne Passwörter) |
| POST   | /api/mail/poll        | Manuellen IMAP-Poll triggern          |

### Pomodoro
| Method | Path                    | Beschreibung                                                          |
|--------|-------------------------|-------------------------------------------------------------------------|
| GET    | /api/pomodoro/settings  | Aktuelle Einstellungen                                                |
| PUT    | /api/pomodoro/settings  | Body: beliebige Teilmenge der Settings-Felder                        |
| GET    | /api/pomodoro/active    | Aktueller Zustand + serverseitig berechnete `phase_duration_seconds` |
| POST   | /api/pomodoro/start     | Body: `{ project, description? }`. 400 falls bereits ein Timer läuft |
| POST   | /api/pomodoro/skip      | Phase sofort beenden (gleiche Logik wie automatischer Phasenwechsel) |
| POST   | /api/pomodoro/continue  | Nur bei `awaiting_confirmation` — startet die bereits gesetzte nächste Phase |
| POST   | /api/pomodoro/stop      | Session abbrechen, zugehörigen `time_entry` sauber abschließen       |

---

## Umgebungsvariablen (`.env`)

```env
# SMTP – ausgehende Mails
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USER=epoch@example.com
SMTP_PASSWORD=secret
SMTP_TLS=true              # true=STARTTLS (587), false=SSL (465)
MAIL_FROM=epoch@example.com
MAIL_TO=du@example.com

# IMAP – eingehende Mails
IMAP_HOST=mail.example.com
IMAP_PORT=993
IMAP_USER=epoch@example.com
IMAP_PASSWORD=secret
IMAP_FOLDER=INBOX
IMAP_POLL_INTERVAL=300     # Sekunden (Standard: 5 Min)
```

Alle Variablen optional — fehlen Credentials, ist Mail deaktiviert.

---

## Projektverwaltung (SettingsPage)

- Projekte werden in der DB gespeichert und beim ersten Start mit 6 Defaults geseedet
- `useProjects()` Hook — lädt einmal, cached im Modul-Scope, verteilt Updates via Listener-Array
- `invalidateProjects()` — leert Cache und triggert Reload in allen Komponenten
- `useProjectNames()` — gibt nur `names: string[]` zurück (für Select-Dropdowns)
- Farben: 12 Preset-Farben, Inline-Picker direkt am Eintrag
- Archivieren statt Löschen wenn Projekt in Einträgen verwendet
- Reihenfolge per `PUT /api/projects/reorder` mit ID-Array

---

## Verlauf- und Stats-Filter

**HistoryPage** — zusätzlich zum Datumsbereich (`from`/`to`) zwei clientseitige Filter über den bereits geladenen Einträgen:
- **Projekt** — Dropdown (`useProjectNames()`), exakte Übereinstimmung
- **Aufgabe** — Freitextsuche, case-insensitive `includes()` auf `description`
- "Filter zurücksetzen"-Button erscheint, sobald einer der beiden aktiv ist

**StatsPage** — die "Nach Projekt"-Balken (und die Legende darunter) sind anklickbar (`selectedProject`-State, Klick auf denselben Balken hebt die Auswahl wieder auf):
- Balken, Legenden-Punkt und Anteils-Balken verwenden die individuelle `project.color` aus den Settings (zusätzlicher `api.getProjects(true)`-Call beim Laden, `include_archived=true` da alte Einträge archivierte Projekte referenzieren können) — nicht mehr eine rang-basierte Akzentfarben-Abstufung. Fallback `var(--text3)` falls ein Entry-Projektname zu keinem aktuellen Projekt mehr passt (z.B. nach Umbenennung)
- Ausgewählter Balken/Legendeneintrag wird hervorgehoben, alle anderen abgedunkelt (Balken über `fillOpacity`, Legende über die bestehende Zeilen-Opacity)
- Die drei oberen Kacheln **Gesamtstunden / Arbeitstage / Ø pro Tag** rechnen bei aktiver Auswahl auf das gefilterte Projekt um (Werte aus den geladenen `entries`, nicht aus `stats`)
- Filter-Chip mit ✕-Button oberhalb der Kacheln; wird beim Monatswechsel automatisch zurückgesetzt
- Unabhängig davon: die "Überstunden"-Karte hat einen eigenen Pro-Tag/Pro-Projekt-Umschalter (siehe unten) — beide Filter sind separate State-Variablen

**HistoryPage Projekt-Filter ist nach `App.jsx` hochgezogen** (`historyProject`/`setHistoryProject`, per Props an `HistoryPage` durchgereicht) — nicht mehr lokaler State der Seite. Grund: die Sidebar (siehe unten) muss den aktuell gewählten Wert kennen. `taskFilter` (Aufgaben-Suche) bleibt dagegen lokaler State in `HistoryPage`, da er nirgendwo sonst gebraucht wird.

### Sidebar Live-Badges

`App.jsx` hält den zentralen `badges`-Objekt-Literal (`{ '/pfad': <Inhalt> }`), gerendert in `Sidebar` neben jedem Nav-Label. Werte können Strings oder JSX sein:

| Route      | Inhalt                                      | Quelle |
|------------|----------------------------------------------|--------|
| `/`        | Laufzeit des aktiven Timers, z.B. `00:12:34` (`⏸` Präfix bei Pause) | `<RunningBadge activeTimer={activeTimer} />` |
| `/woche`   | Aktuelle ISO-Kalenderwoche                    | `KW ${dayjs().isoWeek()}` |
| `/verlauf` | Gewähltes Projekt im Verlauf-Filter, Default `Alle Projekte` | `historyProject` State |
| `/stats`   | Gewählter Monat/Jahr                          | `statsMonth`/`statsYear` State |
| `/mail`    | IMAP-Konfigurationsstatus (Punkt + Label)     | `imapConfigured` |

**`RunningBadge`** ist bewusst eine eigene Komponente (nicht `useTimer` direkt in `App`): der Hook tickt per `requestAnimationFrame`, ein State-Update auf `App`-Ebene würde bei jedem Frame die komplette Seite (Routes + Sidebar) neu rendern. Als eigene Komponente rendert nur sie selbst bei jedem Tick.

**Pause/Resume:** `useTimer(startTime, pausedAt, pausedSeconds)` friert `elapsed` ein, solange `pausedAt` gesetzt ist (kein `requestAnimationFrame`-Tick), und zieht `pausedSeconds` von der Laufzeit ab. Der Live-Punkt (`.sidebar-live-dot`, Bottom-Nav-Dot) wechselt bei Pause von `--accent` auf `--amber`, damit der Zustand auch ohne Blick auf die Timer-Seite erkennbar ist.

`badges` wird nur in der Desktop-`Sidebar` verwendet; `mobileBadges` (Bottom-Nav) ist eine separate, bewusst schlankere Variante ohne Timer-Badge (Live-Dot reicht dort, wenig Platz auf Mobile) — der Verlauf-Badge (gewähltes Projekt) wird seit v3.9 auch dort angezeigt.

`.sidebar-badge` hat `max-width: 90px` + `text-overflow: ellipsis`, damit lange Projektnamen (z.B. `Dokumentation`) nicht überlaufen.

---

## Überstunden-System

### Schwellen
```js
WORK_DAY_MINUTES = 480   // 8h – Normalarbeitszeit
MAX_DAY_MINUTES  = 600   // 10h – Umbuchungsgrenze
```

### `getOvertimeInfo(totalMinutes)`
```js
// Returns: { overtime: number, mustRebook: number, level: 'none'|'overtime'|'rebook' }
// overtime  = Minuten über 8h
// mustRebook = Minuten über 10h
```

### `OvertimeBanner` Komponente
```jsx
<OvertimeBanner totalMinutes={totalMinutes} />          // voller Banner
<OvertimeBanner totalMinutes={totalMinutes} compact />  // kompakte Tags
```

**Anzeige:**
- `level === 'none'` → nichts
- `level === 'overtime'` → Amber-Banner: `⏱ +Xh Überstunden · Mehr als 8h gebucht`
- `level === 'rebook'` → Amber + Rot-Banner: `⚠ Xmin müssen umgebucht werden · Mehr als 10h`

**Eingebunden in:**
- `TimerPage` — voller Banner zwischen Einträgen und Tagesnotiz
- `WeekPage` → `DayCard` — kompakte Tags neben Tagesstunden
- `HistoryPage` — kompakte Tags neben Tagessummen-Header

### Monatliche Überstunden (StatsPage)

`StatsPage` lädt zusätzlich zu `/api/stats/monthly` alle Einträge des Monats (`/api/entries`) und berechnet die Überstunden clientseitig — mit einem Umschalter **Pro Tag** / **Pro Projekt** (State `overtimeView`):

**Pro Tag** — Tagessumme über alle Projekte, gleiche Schwelle wie `getOvertimeInfo`:
- Für jeden Tag: `overtime = max(0, Tagessumme − 480min)`
- "Gesamt" = Summe aller Tages-Überstunden, "Tage mit ÜS" = Anzahl betroffener Tage
- `>10h`-Warnbanner ("sollten umgebucht werden") nur in dieser Ansicht sichtbar — bezieht sich auf die Tagesgesamtsumme, ergibt pro Projekt keinen Sinn

**Pro Projekt** — zählt **nur**, wenn ein einzelnes Projekt an einem Tag für sich genommen mehr als 8h gebucht hat (keine anteilige Verteilung der Tagesüberstunde auf mehrere Projekte):
- Für jeden Tag und jedes Projekt: `overtime = max(0, Projektminuten_am_Tag − 480min)`
- Pro Projekt wird die Liste der beitragenden Tage mit Datum angezeigt (wie in der Pro-Tag-Ansicht)
- "Gesamt" und "Tage mit ÜS" oben in der Karte rechnen in dieser Ansicht mit den projektbezogenen Werten, nicht mit der Tagesansicht

Beispiel (Juli 2026): 11 Tage mit Tages-Überstunden, aber nur `Support` hatte an 2 Tagen (21.07., 23.07.) allein >8h → 90min Projekt-Überstunden, obwohl `Entwicklung` an einzelnen Tagen ebenfalls beteiligt war (aber nie allein >8h).

---

## Pomodoro-Timer im Detail

**Treibt den echten Zeiterfassungs-Timer** (bewusste Design-Entscheidung, keine separate Fokus-Uhr): `POST /api/pomodoro/start` erstellt denselben `time_entry` wie der normale Timer-Start und lässt ihn über die gesamte Fokus-Session (mehrere Arbeits-/Pausenintervalle) durchlaufen — bei jedem Wechsel in eine Pause wird die Entry über den bestehenden `paused_at`/`paused_seconds`-Mechanismus automatisch pausiert, beim nächsten Arbeitsintervall automatisch fortgesetzt. Eine Pomodoro-Session belegt daher denselben "es läuft bereits ein Timer"-Slot wie der normale Timer (`POST /api/pomodoro/start` schlägt mit 400 fehl, wenn schon ein Timer läuft, und umgekehrt).

**Kein manuelles Pausieren während einer Pomodoro-Arbeitsphase** — die klassische Pomodoro-Technik kennt keine Pause mitten im Intervall. Solange eine Session aktiv ist, zeigt `TimerPage.jsx` statt der normalen `RunningTimer`-Karte die eigenständige `PomodoroCard` (Countdown, Zyklus-Punkte, „Überspringen"/„Abbrechen" statt Start/Pause/Stop).

**Serverseitiger Hintergrund-Tick (`_pomodoro_loop()`, alle 2s) treibt Phasenwechsel** — analog zum bestehenden `_imap_loop()`-Muster, damit der Zustand unabhängig vom offenen Tab konsistent bleibt (Backend ist Source of Truth, wie beim aktiven Timer). Die eigentliche Übergangslogik (`_advance_pomodoro_phase()`) wird sowohl vom Tick als auch vom manuellen `POST /api/pomodoro/skip` aufgerufen.

**„Auto-Start nächste Phase" aus → Warteposition statt Auto-Weiterlauf:** ist die Einstellung deaktiviert, geht der Zustand nach Phasenende in `awaiting_confirmation=1` statt sofort weiterzulaufen; die `PomodoroCard` zeigt dann einen „Weiter"-Button (`POST /api/pomodoro/continue`). Wichtig: Beim Wechsel von Arbeit → Pause wird die Entry sofort pausiert (unabhängig vom Auto-Start), beim Wechsel von Pause → Arbeit dagegen **erst** beim tatsächlichen Start der Arbeitsphase (auto oder per `/continue`) wieder fortgesetzt — sonst würde bei deaktiviertem Auto-Start schon während der Wartephase weitergezählt.

**`cycles_completed`** zählt abgeschlossene Arbeitsintervalle hochlaufend, resettet nicht automatisch nach einer langen Pause (nur bei `/stop`) — `cycles_completed % cycles_before_long_break` ergibt die Position im aktuellen Zyklus für die Punkte-Anzeige in der `PomodoroCard`.

**Benachrichtigung bei Phasenwechsel:** `usePomodoro.js` erkennt Phasenwechsel durch Vergleich mit dem vorherigen Poll-Ergebnis (Polling alle 5s + bei `visibilitychange`/`focus`, gleiches Muster wie der aktive Timer) und feuert dann optional Sound (Web-Audio-API-Oszillator-Beep, kein Audio-Asset im Repo nötig) und/oder Browser-`Notification`, je nach `sound_enabled`/`notifications_enabled` in den Pomodoro-Settings. Notification-Permission wird beim ersten Start einer Session bzw. beim Aktivieren in den Settings angefragt.

**`usePomodoro()` läuft zentral in `App.jsx`** (nicht in `TimerPage.jsx`) — genau wie `activeTimer` — und wird per Prop an `TimerPage` durchgereicht. Grund: nur so ist der Zustand app-weit bekannt, unabhängig davon welche Seite gerade offen ist (nötig für die Navigationssperre, siehe unten, und damit Sound/Notification/Cross-Device-Sync nicht nur auf der Timer-Seite funktionieren).

**Navigationssperre während einer aktiven Session:** Solange `pomodoro.state.phase` gesetzt ist, werden in `Sidebar`/`BottomNav` (`App.jsx`) alle Menüpunkte außer „Timer" optisch deaktiviert (reduzierte Opazität, 🔒-Badge, `title`-Tooltip) und ihr Klick per `preventDefault()` unterbunden. Zusätzlich erzwingt ein `useEffect` in `App()` per `navigate('/', { replace: true })` einen Redirect auf die Timer-Seite, falls per direkter URL-Eingabe (oder weil die Session von einem anderen Gerät gestartet wurde) eine andere Route aktiv ist. Der Timer-Menüpunkt selbst bleibt immer erreichbar.

**Master-Schalter `enabled`:** Ist Pomodoro in den Settings deaktiviert, verschwindet der „🍅 Als Pomodoro starten"-Button auf der Timer-Seite und `POST /api/pomodoro/start` lehnt mit 400 ab — Durchsetzung also auf beiden Seiten (Frontend blendet aus, Backend validiert zusätzlich), analog zum bestehenden „Ein Timer läuft bereits"-Guard.

---

## Schwebendes Fenster (Floating Widget) im Detail

Zeigt laufenden Timer bzw. laufende Pomodoro-Session in einem eigenen, immer-im-Vordergrund-Fenster — bleibt sichtbar auch wenn ein anderer Browser-Tab oder ein anderes Programm aktiv ist. Implementiert über die **Document Picture-in-Picture API** (`window.documentPictureInPicture.requestWindow()`), nicht über einen eigenen Prozess — es ist dasselbe Tab/dieselbe JS-Realm, nur mit einem zweiten, always-on-top Browser-Fenster als zusätzlichem Render-Ziel.

**`usePipWidget()` (`FloatingWidget.jsx`)** kapselt Öffnen/Schließen: `open()` muss aus einem echten User-Klick heraus aufgerufen werden (Browser-Vorgabe für PiP), erzeugt darum den `📌`/`🗗`-Button (`PipButton` in `TimerPage.jsx`) direkt in `RunningTimer`/`PomodoroCard`. Der Hook lebt in `App.jsx` (nicht in `TimerPage.jsx`), damit das Fenster beim Wechsel der Route (z.B. während eines normalen, nicht Pomodoro-gebundenen Timers) nicht durch Unmount geschlossen wird.

**Styles werden 1:1 aus dem Haupttab übernommen** (`copyStyles()`): iteriert `document.styleSheets`, hängt für `<link>`-Stylesheets (Google Fonts, Vite-Bundle-CSS) ein neues `<link>` mit derselben `href` ins PiP-`<head>`, für Inline-`<style>`-Tags eine Kopie des `textContent` — dadurch sind CSS-Variablen (`--accent`, `--bg`, …) und Klassen (`.tag`, `.pulse`, `.mono`) im PiP-Dokument identisch verfügbar, ohne `cssRules` cross-origin auslesen zu müssen (würde bei Google Fonts an CORS scheitern).

**Inhalt via `createPortal`:** `<FloatingWidget pipWindow={pip.pipWindow} activeTimer={activeTimer} pomodoro={pomodoro} />` (in `App.jsx`, außerhalb der `<Routes>`) rendert bei offenem PiP-Fenster denselben Timer-/Pomodoro-State per React-Portal in `pipWindow.document.body` — kein separates Polling/Ticking nötig, der Countdown läuft über denselben `useTimer`-Hook wie in der normalen Ansicht.

**Automatisches Schließen:** Ein `useEffect` in `App.jsx` schließt das PiP-Fenster, sobald weder `activeTimer` noch eine Pomodoro-Session mehr aktiv ist (`pip.pipWindow.close()` löst intern das `pagehide`-Event aus, das den Hook-State zurücksetzt).

**Browser-Support:** Document Picture-in-Picture ist aktuell **Desktop-Chromium-only** (Chrome/Edge/Brave ≥ 116 auf Windows/Mac/Linux). Auf Mobil (Android/iOS) fehlt die API in **jedem** Browser, auch in mobilem Chrome/Brave/Edge — Chromium hat sie dort bislang nicht implementiert, unabhängig vom Browser-Anbieter. `PIP_SUPPORTED`-Flag (`'documentPictureInPicture' in window`) blendet den Button entsprechend überall aus, wo die API fehlt (Firefox, Safari, alle mobilen Browser) — kein Fallback nötig, Kernfunktion (Timer starten/stoppen) bleibt unberührt.

---

## Idle-Erkennung im Detail

Erkennt, wenn der Rechner gesperrt oder der Tab/die App längere Zeit im Hintergrund war, während der Timer eigentlich weiterlief, und bietet an, die Zeit nachträglich abzuziehen.

**`useIdleDetection(active)` (`hooks/useIdleDetection.js`)** hört auf `document.visibilitychange` — merkt sich den Zeitpunkt, an dem der Tab `hidden` wird (Rechner gesperrt, Tab-/App-Wechsel funktioniert dafür browserübergreifend zuverlässig, echte OS-Idle-APIs wie die `IdleDetection`-API sind Chromium-only und brauchen eine extra Permission). Wird der Tab wieder `visible`, berechnet der Hook die Lücke; ab der konfigurierten Schwelle (Default 3 Min) und nur falls `active` (= ein Timer lief zu dem Zeitpunkt tatsächlich, nicht pausiert) wahr ist, wird ein `prompt` gesetzt.

**Schwelle konfigurierbar pro Gerät** über `useIdleThresholdMinutes()` / `setIdleThresholdMinutes()` (localStorage-Key `epoch.idleThresholdMinutes`, kein Backend-Feld) — bewusst *nicht* server-synced wie die Pomodoro-Settings, weil die Erkennung selbst pro Gerät läuft (jedes Gerät beobachtet nur seinen eigenen Tab, ein Handy sperrt sich anders/schneller als ein Desktop-Rechner). Änderungen in `SettingsPage.jsx` (`IdleSettingsCard`) feuern ein `epoch:idle-threshold-change`-Custom-Event, damit der bereits gemountete Hook in `App.jsx` die neue Schwelle sofort übernimmt, ohne Reload.

**„Speichern" auf beiden Settings-Karten (Pomodoro + Idle) navigiert per `window.location.href = '/'` zurück zur Timer-Seite und lädt die App dabei komplett neu.** Grund: `usePomodoro()` lebt in `App.jsx` und lädt seine Settings nur einmal beim Mount — ein Save in `PomodoroSettingsCard` (eigener, unabhängiger `api.getPomodoroSettings()`-Call in `SettingsPage.jsx`) würde den App-weiten Pomodoro-State sonst nicht aktualisieren, bis zum nächsten Poll/Fokuswechsel. Der volle Reload ist die pragmatische Lösung dafür, statt eine Callback-Kette durch die Komponenten zu ziehen.

**Gelebt wird der Hook in `App.jsx`** (nicht in `TimerPage.jsx`), aus demselben Grund wie beim PiP-Fenster: er soll auch dann feuern, wenn beim Zurückkommen gerade eine andere Route aktiv ist. `active` wird aus `activeTimer && !activeTimer.paused_at` abgeleitet — das ist dieselbe zugrunde liegende `time_entry`-Zeile, egal ob der normale Timer oder eine Pomodoro-Arbeitsphase lief.

**`IdleBanner`** (in `App.jsx`) erscheint als fixer Balken am oberen Bildschirmrand mit „Du warst seit HH:MM inaktiv (ca. X Min). Zeit abziehen?" + zwei Buttons. „Abziehen" ruft `POST /api/timer/deduct` mit den erkannten Sekunden auf.

**Backend `deduct_timer`** (`main.py`) verhält sich wie ein rückwirkendes Pause/Resume: erhöht `paused_seconds` des aktiven Eintrags direkt, ohne `paused_at` zu setzen — der Timer läuft optisch ununterbrochen weiter, nur die angezeigte/gespeicherte Dauer schrumpft. Gedeckelt auf die tatsächlich verstrichene Laufzeit (`(jetzt - start_time) - paused_seconds`), damit nicht mehr abgezogen werden kann als real vergangen ist. 400 falls der Timer gerade pausiert ist (dann läuft ohnehin schon nichts mit, das abgezogen werden müsste).

---

## Export: Tageszusammenfassung im Detail

Läuft komplett **client-seitig** in `ExportPage.jsx`, kein eigener Backend-Endpoint (es gab kurzzeitig einen serverseitig aggregierenden `/api/export/summary`, der wurde wieder entfernt — die gewünschte Struktur braucht keine Summierung mehr, siehe unten). Datengrundlage ist das ohnehin vorhandene `GET /api/entries` (gefiltert auf `end_time` gesetzt, also nur abgeschlossene Einträge).

**Gruppierung: `(Datum, Projekt, Tätigkeit)`.** Nur exakt identische Tätigkeitsbeschreibungen innerhalb desselben Tags und Projekts werden zusammengefasst (Dauer summiert) — unterschiedliche Beschreibungen bleiben immer eigene Einträge, auch wenn sie inhaltlich ähnlich klingen. Verschachtelte `Map`s (Datum → Projekt → Tätigkeit → Minuten) sorgen dafür, dass eine zusammengefasste Tätigkeit an der Stelle ihres **ersten** Auftretens stehen bleibt (erneutes `.set()` auf einen bestehenden Key verschiebt ihn nicht in der Iterationsreihenfolge) — z. B. viermal „ETCS-Schulung" am selben Tag im selben Projekt wird zu einer Zeile `ETCS-Schulung (4h)`.

**Reihenfolge chronologisch:** `formatProjectDaySummary()` sortiert alle Einträge zuerst global nach `start_time` (String-Vergleich reicht, da ISO-Format), gruppiert dann in verschachtelten `Map`s nach Datum → Projekt. Da `Map` die Einfügereihenfolge beibehält, ergibt sich automatisch: Tage aufsteigend, Projekte innerhalb eines Tages in der Reihenfolge ihres ersten Auftretens, Tätigkeiten innerhalb eines Projekts chronologisch.

**Format:** eine Zeile pro `(Datum, Projekt)`-Kombination: `{Projekt} – {Tätigkeit1} ({h1}), {Tätigkeit2} ({h2}), ...`, darüber ein Datums-Header (`dddd, D. MMMM YYYY`). Fehlt die Tätigkeit bei einem Slot, wird `Sonstiges` als Platzhalter verwendet.

**Einheit ausschließlich Stunden:** `fmtHours(minutes)` = `Math.round((minutes/60)*100)/100` + `"h"` — 2 Nachkommastellen, JS-Zahl-zu-String entfernt überflüssige Nullen automatisch (`1` statt `1.00`, `0.5` statt `0.50`). Bewusst **kein** Minuten-Anteil mehr wie beim alten `fmtMinutes()` (`1h 23min`) — abweichend vom sonst in der App üblichen Format, hier explizit so gewünscht.

Vorschau (`<pre>`, kopierbar über `navigator.clipboard`) und `.txt`-Download (client-seitig per `Blob`) nutzen beide dieselbe formatierte Zeichenkette. Ein `useEffect` setzt die Vorschau bei Änderung von `from`/`to` zurück.

---

## Mail-Feature im Detail

### Ausgehend (SMTP)
- Button auf Timer-Seite + dedizierte Mail-Seite
- HTML-Tagesreport: Tabelle mit Datum | Start | Ende | Projekt | Beschreibung

### Eingehend (IMAP) — Pflichtformat
```
Datum      | Start | Ende  | Projekt     | Beschreibung
2026-06-01 | 09:00 | 10:00 | Support     | Planung Roadmap Q3
2026-06-01 | 10:30 | 12:00 | Entwicklung | Auth-System
```
**Alle 5 Spalten Pflicht.** Beschreibung darf nicht leer sein.
Zeilen mit `>` oder `#` werden ignoriert.

### Fehlerbehandlung — Alles-oder-nichts
Bei einer einzigen ungültigen Zeile:
- Gesamte Mail wird abgelehnt — kein Eintrag wird importiert
- `MailParseError(lineno, line, reason)` mit `user_message()`
- `_diagnose_line(line)` — spezifischer Fehlergrund
- Falls SMTP konfiguriert: automatische Fehler-Mail zurück an Absender

---

## Frontend-Design-System

**CSS-Variablen** (Werte unten = Theme „Original", der Standard-Zustand ohne `data-theme`-Attribut):
```css
--bg: #0a0a0a      --bg2: #111        --bg3: #1a1a1a    --bg4: #222
--border: #2a2a2a  --border2: #333
--text: #e8e4dc    --text2: #888880   --text3: #555550
--accent: #c8f060
--red: #ff4444     --amber: #ffaa00
--sans: 'Syne'     --mono: 'DM Mono'
--r: 4px           --rl: 8px
```
`--accent-dim`/`--accent-dim2`/`--red-dim`/`--amber-dim` werden **einmalig** in `:root` per `color-mix(in srgb, var(--accent) 12%, transparent)` (analog für red/amber) aus der jeweiligen Basisfarbe abgeleitet — kein Theme muss diese Ableitungen selbst pflegen.

**Source-Badges:**
| `source` | Herkunft | Farbe              | Label   |
|----------|----------|--------------------|---------|
| 0        | Timer    | (kein Badge)       | —       |
| 1        | Manuell  | `#6699ff` (Blau)   | manuell |
| 2        | E-Mail   | `#ffaa00` (Amber)  | E-Mail  |

**Navigation:** 7-Tab Bottom Nav — Timer · Woche · Verlauf · Stats · Mail · Export · Settings

---

## Design-Themes (SettingsPage)

**Farbe und Schrift sind unabhängig wählbar** — zwei separate Settings-Karten mit je 4 Optionen, die frei kombinierbar sind (z.B. Original-Farbe mit Archivo-Schrift). Beide nutzen dieselben 4 Namen, weil sie aus denselben Design-Richtungen stammen, sind aber technisch komplett getrennt: `[data-theme="…"]` überschreibt nur `--bg*`/`--border*`/`--text*`/`--accent`, `[data-font="…"]` nur `--sans`/`--mono`. `--red`/`--amber` sind bewusst **fest, weder theme- noch fontabhängig** (nur einmal in `:root`), damit Status-Farben (Überstunden, Fehler) nie mit dem gewählten Akzent kollidieren.

| Name       | `data-theme` → Akzent | `data-font` → Sans / Mono |
|------------|------------------------|----------------------------|
| Original   | *(kein Attribut)* `#c8f060` Neongrün | *(kein Attribut)* Syne / DM Mono |
| Puls       | `puls` `#ff6347` Tomato | `puls` Archivo / DM Mono |
| Archiv     | `archiv` `#2fb8a6` Petrol | `archiv` Fraunces / JetBrains Mono |
| Loop       | `loop` `#b487ff` Violett | `loop` Fredoka / Space Mono |

**`useTheme()`/`useFont()`** (`hooks/useTheme.js`, beide über eine gemeinsame `useAttrSetting(storageKey, attrName)`-Hilfsfunktion) halten ihren Wert je in eigenem `localStorage`-Key (`epoch.theme`/`epoch.font`) und setzen/entfernen ihr jeweiliges Attribut auf `document.documentElement` per `useEffect` — reiner CSS-Variablen-Wechsel, kein Reload nötig (anders als Pomodoro-/Idle-Settings). Beide in `App.jsx` gemountet (wie `activeTimer`/`pomodoro`), als Props an `SettingsPage` durchgereicht. **Bewusst nicht server-synced** — analog zur Idle-Schwelle eine einfache Pro-Gerät-Anzeigeeinstellung ohne Backend-Feld.

**Alle Seiten-Komponenten verwenden ausschließlich `var(--accent)` und `color-mix(in srgb, var(--accent) N%, transparent)`** statt fest verdrahteter Hex-/rgba-Werte (TimerPage, MailPage, ExportPage, WeekPage, StatsPage inkl. Recharts-Tooltip/-Achsen) — das war Voraussetzung dafür, dass ein Theme-Wechsel überhaupt alle Stellen erreicht. `SettingsPage`s `PRESET_COLORS`-Palette (Projekt-Tag-Farben) bleibt davon unberührt, da sie unabhängig vom App-Theme ist.

Favicon (`favicon.svg`) ist **statisch auf Original/Grün fixiert** — reagiert nicht auf die Theme-Wahl (Browser-Icons lassen sich nicht ohne Weiteres laufzeit-abhängig austauschen, und ein fixes Icon als App-Identität ist ohnehin üblich).

---

## Wichtige Implementierungsdetails

### Zeitdarstellung
- Backend speichert **UTC**, Frontend zeigt Lokalzeit via `toLocaleTimeString('de-DE')`
- Manuelle Einträge: `HH:MM`-Eingabe → `_parse_hhmm(date, hhmm)` → UTC-Datetime
- `fmtTime(isoStr)` — UTC-ISO → lokale Uhrzeit `"14:37"`
- `fmtMinutes(min)` — `"1h 23min"`
- `fmtDuration(ms)` — `"01:23:45"`

### useProjects Hook
```js
const { projects, loading, refresh } = useProjects()
const { names, projects, loading }   = useProjectNames()
invalidateProjects()  // nach jeder Mutation aufrufen
```

### Cross-Device-Sync (Polling)
`App.jsx` pollt `/api/timer/active` alle 5s (zusätzlich sofort bei `visibilitychange`/`focus`) und hält `activeTimer` aktuell — so übernimmt z.B. der Desktop-Tab automatisch den Timer-Status (läuft/pausiert/gestoppt), wenn er am Handy geändert wurde, ohne Reload.

`TimerPage.jsx` pollt zusätzlich `loadToday()` (Tageseinträge, Notiz, Summe) alle 5s + sofort bei `visibilitychange`, damit auch Änderungen von anderen Geräten (manuelle Einträge, Notiz) sichtbar werden, selbst wenn sich `activeTimer` dabei nicht ändert.

**Wichtig:** Als SPA lädt ein bereits offener Tab neuen Frontend-Code nicht von selbst nach — nach jedem Rebuild/Deploy braucht ein offener Tab (Handy wie Desktop) einmal ein manuelles Neuladen, um die neue JS-Version zu bekommen.

Beide Intervalle sind bewusst kurz für zügigen Sync, aber unkritisch für Backend-Last bei Einzel-User-Betrieb. Kein WebSocket/SSE — reines Polling.

### Nginx
- `/api/` → `proxy_pass http://backend:8000/api/`
- JS/CSS/Fonts → 1 Jahr Cache
- Alles andere → `index.html` (SPA-Routing)
- Gzip aktiv

### Docker Multi-Stage (Frontend)
```dockerfile
FROM node:20-alpine AS builder   # npm ci + vite build
FROM nginx:alpine                 # nur dist/ + nginx.conf
```

---

## Bekannte Einschränkungen

- **SQLite** — kein paralleler Schreibzugriff; für Einzel-User ausreichend
- **IMAP-Polling** — blockierender Call in `run_in_executor`; bei sehr vielen Mails spürbar
- **Zeitzone** — UTC im Backend, Lokalzeit im Browser; bei verschiedenen Zeitzonen möglich falsche Darstellung manueller Einträge
- **Keine Authentifizierung** — für lokales Netz ausreichend; für Internet: Basic Auth in Nginx empfohlen
- **PWA ohne Service Worker** — kein Offline-Betrieb
- **Schwebendes Fenster (Document Picture-in-Picture)** — nur Desktop-Chromium (Chrome/Edge/Brave ≥ 116); auf Mobil (Android/iOS) fehlt die API in allen Browsern, Button dort ausgeblendet
- **Projekte in Einträgen** — Umbenennen eines Projekts ändert **nicht** die bestehenden Einträge (String-Referenz); bei Umbenennung bleibt der alte Name in historischen Einträgen erhalten
- **Idle-Erkennung** — basiert auf `visibilitychange`, nicht auf echter Maus-/Tastatur-Inaktivität; erkennt zuverlässig Rechner sperren/Tab wechseln, aber nicht "Tab bleibt offen sichtbar, aber Nutzer ist einfach weg" (z.B. Bildschirm bleibt an); Schwelle ist in den Settings konfigurierbar, aber **pro Gerät** (localStorage) — synct nicht zwischen Geräten wie die Pomodoro-Settings

---

## TODO / Geplante Features

### Mobiles Pendant zum Schwebenden Fenster (Web-Push-Notification)

Document Picture-in-Picture (siehe „Schwebendes Fenster (Floating Widget) im Detail" oben) ist Desktop-only — auf dem Handy (Android/iOS) fehlt die API komplett. Geplanter Ersatz: eine sich periodisch aktualisierende **Push-Notification** mit laufender Timer-/Pomodoro-Zeit, solange eine Session aktiv ist. Kein echtes "sticky/ongoing" Notification wie bei nativen Apps möglich (Nutzer kann sie wegwischen, sie kommt erst beim nächsten Update-Zyklus wieder) — aber der beste erreichbare Kompromiss auf Mobil-Web.

**Schritte:**
1. VAPID-Schlüsselpaar generieren (einmalig)
2. Backend: Tabelle `push_subscriptions` (endpoint, keys, angelegt am) + `POST /api/push/subscribe` / `/unsubscribe`
3. Backend: `_push_loop()` — Hintergrund-Task analog zu `_pomodoro_loop()`, sendet Update alle ~3–5 Min (statt sekündlich, wegen Akku/Traffic) an alle Subscriptions solange Timer/Pomodoro aktiv, per `pywebpush`; ersetzt Notification via festem `tag` statt zu stapeln; zusätzlich sofortiges Update bei Pomodoro-Phasenwechsel
4. Frontend: erster Service Worker im Projekt (`public/sw.js`) — `push`-Event → `registration.showNotification()`, `notificationclick` → App öffnen
5. Frontend: Subscribe-Flow (Permission anfragen, `pushManager.subscribe()`, Subscription ans Backend senden), Settings-Toggle „Push bei laufendem Timer"
6. Testing auf echtem Handy (Push lässt sich in Chrome-Devtools nicht zuverlässig simulieren)

**Aufwand:** ~1–1,5 Tage fokussierte Arbeit.

**Zu beachten:**
- Führt den **ersten Service Worker** im Projekt ein — bricht mit der bisherigen bewussten Einschränkung „PWA ohne Service Worker" (s. o.); architektonischer Schritt, nicht nur ein Feature-Häkchen
- **HTTPS Pflicht** für Service Worker + Push (außer `localhost`) — Voraussetzung ist der geplante Let's-Encrypt-Rollout
- iOS nur wenn PWA per „Zum Home-Bildschirm hinzufügen" installiert ist, iOS ≥ 16.4, stärker eingeschränkt als Android

### Backup-Lösung für SQLite-Datenverzeichnis

Aktuell kein automatisiertes Backup — die DB liegt als Bind-Mount unter `/home/christian/claude/data/timetracker.db` auf dem Host (kein Docker-Volume mehr, s. Architektur oben), ein Datenverlust bei versehentlichem Löschen/Host-Crash wäre nicht wiederherstellbar.

**Schritte:**
1. Backup-Skript (`backup.sh`): packt `/home/christian/claude/data/timetracker.db` direkt als `tar.gz` mit Datumsstempel — kein Hilfscontainer mehr nötig, da normaler Host-Pfad
2. Vor dem Backup Backend kurz stoppen (`docker compose stop backend`) für konsistenten Snapshot, danach wieder starten — Alternative `cp` bei laufendem Container ist einfacher, aber nicht garantiert konsistent
3. Rotation/Aufbewahrung klären (z. B. letzte 7 Tage + letzte 4 Wochen behalten, ältere löschen)
4. Ablagespeicherort für Backups festlegen (externe Platte, NAS, Cloud-Storage?) — noch offen
5. Automatisierung per Cron auf dem Host

**Aufwand:** ~1 Stunde für Skript + Cron, je nach gewähltem Ablageort ggf. mehr.

**Zu beachten:**
- Restore-Vorgang einmal testen, nicht nur Backup — sonst unklar ob Dump im Ernstfall wirklich nutzbar ist

---

## Häufige Aufgaben

### Container neu bauen
```bash
docker compose up --build
# oder wenn läuft:
docker compose down && docker compose up --build
```

### Polling-Intervall ändern
`.env`: `IMAP_POLL_INTERVAL=60` → `docker compose restart backend`

### Backup
```bash
tar czf backup-$(date +%Y%m%d).tar.gz -C /home/christian/claude/data .
```

### API-Smoke-Tests
```bash
docker compose up -d   # Container müssen laufen
cd backend/tests && ./test_api.sh   # oder: BASE_URL=... ./test_api.sh
```
Curl-basiert, deckt die wichtigsten Endpunkte ab. Legt eigene Test-Projekte/-Einträge an und räumt sie danach wieder auf — rührt Produktivdaten nicht an.

### Swagger UI
`http://localhost:8000/docs` (direkt am Backend, nicht über Nginx)

### Dev-Mode (ohne Docker)
```bash
cd backend  && uvicorn main:app --reload
cd frontend && npm install && npm run dev
```

---

## Versionshistorie

| Version | Änderungen |
|---------|------------|
| v1.0    | Timer, Woche, Verlauf, Stats, Tagesnotizen, Export CSV/JSON, Nginx Reverse Proxy |
| v2.0    | Manuelle Zeiteinträge (Modal), Bearbeiten-Funktion, Source-Badges |
| v3.0    | Mail: SMTP-Reports, IMAP-Polling, Mail-Log-Seite, 6. Nav-Tab |
| v3.1    | Mail-Pflichtformat 5 Spalten, Alles-oder-nichts-Import, Fehler-Rückmeldungsmail |
| v3.2    | Überstunden-Anzeige (>8h Amber, >10h Rot + Umbuchen-Hinweis), OvertimeBanner |
| v3.3    | Projektverwaltung in DB, Settings-Seite, useProjects-Hook, 7. Nav-Tab |
| v3.4    | Desktop-Sidebar (≥860px) statt Bottom-Nav, Live-Badges (KW / gewählter Monat / IMAP-Status), Versionsanzeige in Sidebar |
| v3.5    | Verlauf: Filter nach Projekt und Aufgabe. Stats: Projekt-Filter im Balkendiagramm (anklickbar), monatliche Überstunden-Karte mit Pro-Tag/Pro-Projekt-Umschalter |
| v3.6    | Sidebar Live-Badges: laufende Timer-Zeit bei "Timer", ausgewähltes Projekt bei "Verlauf" (Default "Alle Projekte") |
| v3.7    | Cross-Device-Sync per Polling: `activeTimer` alle 10s + bei Tab-Fokus, Tagesdaten alle 15s + bei Tab-Fokus — Timer-Start/Stop/Pause auf einem Gerät erscheint automatisch auf anderen, ohne Reload |
| v3.8    | Sync-Intervalle von 10s/15s auf einheitlich 5s verkürzt (weniger Zeitversatz zwischen Geräten) |
| v3.9    | Verlauf-Badge (gewähltes Projekt) auch in der mobilen Bottom-Nav sichtbar, nicht mehr nur in der Desktop-Sidebar |
| v4.0    | Pomodoro-Timer: treibt den echten Zeiterfassungs-Timer (auto Pause/Resume via `paused_at`/`paused_seconds`), konfigurierbar in den Settings (Dauern, Zyklen, Auto-Start, Ton, Notifications), serverseitiger Hintergrund-Tick für Phasenwechsel, `PomodoroCard` auf der Timer-Seite |
| v4.1    | Pomodoro: Master-Schalter zum kompletten Deaktivieren (Frontend + Backend-Guard), Navigation zu anderen Menüpunkten während aktiver Session gesperrt (`usePomodoro()` dafür nach `App.jsx` gehoben), SVG-Favicon im Epoch-Uhr-Design |
| v4.2    | Export: Tageszusammenfassung als Text — pro Tag und Projekt, Tätigkeiten chronologisch und unaggregiert mit Dauer in Stunden (z.B. „Support – Daily Standup (0.5h), Abstimmung intern (1h)"), Vorschau (kopierbar) + .txt-Download auf der Export-Seite |
| v4.3    | Schwebendes Fenster für Timer/Pomodoro via Document Picture-in-Picture API (`FloatingWidget.jsx`, `usePipWidget()`) — bleibt sichtbar unabhängig vom aktiven Browser-Tab, übernimmt App-Styles automatisch, schließt sich selbst sobald kein Timer mehr läuft, Chromium-only |
| v4.4    | Idle-Erkennung: `useIdleDetection()` erkennt via `visibilitychange`, wenn der Rechner gesperrt/Tab länger inaktiv war während der Timer lief (≥3 Min), `IdleBanner` bietet nachträglichen Abzug an, neuer Endpoint `POST /api/timer/deduct` (rückwirkendes Pause/Resume ohne Unterbrechung, gedeckelt auf tatsächlich verstrichene Zeit) |
| v4.5    | Idle-Erkennung: Schwelle in den Settings konfigurierbar (`IdleSettingsCard`) — pro Gerät via localStorage (`useIdleThresholdMinutes()`/`setIdleThresholdMinutes()`), bewusst nicht server-synced |
| v4.6    | `NumberField` (Settings) ließ sich nicht unter 10 leeren/eintippen — Fallback `parseInt('') \|\| 1` schrieb bei jedem Löschen sofort wieder eine „1" rein, gefixt via erlaubtem leerem Zwischenzustand + Clamp erst bei `onBlur`. „Speichern" auf Pomodoro-/Idle-Settings-Karte navigiert jetzt per vollem Reload zurück zur Timer-Seite (`window.location.href = '/'`), damit der App-weite Pomodoro-State sofort aktuell ist |
| v4.7    | Backup-TODO für SQLite-Datenverzeichnis ergänzt (Doku, kein Code) |
| v4.8    | Gesperrte Nav-Items (während aktiver Pomodoro-Session) zeigen statt 🔒-Emoji eine ausgegraute Styling-Variante |
| v4.9    | Docker-Volume durch Bind-Mount `/home/christian/claude/data` ersetzt (kein Docker-Volume mehr), Backup-Doku entsprechend angepasst |
| v4.10   | Nur Doku-Sync: Healthcheck-Intervall (30s→5m, Retries 3→1), API-Smoke-Tests (`backend/tests/test_api.sh`) und fehlende Versionshistorie v4.7–v4.9 ergänzt |
| v4.11   | Design-Richtung „Puls" umgesetzt: Akzentfarbe Grün→Orange (`--accent: #ff7a33`, vorher `#c8f060`), Sans-Schrift Syne→Archivo (Google-Fonts-Link + Font-Weights angepasst). Alle bisher fest verdrahteten `rgba(200,240,96,…)`/`#c8f060`-Stellen in TimerPage, MailPage, ExportPage, WeekPage, StatsPage sowie Favicon auf die neue Akzentfarbe umgestellt. Amber/Rot (Status-Farben) unverändert. `PRESET_COLORS` in SettingsPage (Projekt-Tag-Farben, unabhängig vom App-Akzent) bewusst nicht angefasst |
| v4.12   | Akzentfarbe nachjustiert: `#ff7a33` lag mit nur 19° Farbtonabstand zu spät zu nah an Amber (Überstunden-Warnung), Tags waren kaum auseinanderzuhalten. Auf `#ff6347` (Tomato) verschoben — 31° Abstand zu Amber, da Amber häufiger neben dem Akzent auftaucht (Timer-Karte) als Rot |
| v4.13   | StatsPage „Nach Projekt": Balken/Legende/Anteils-Balken zeigen jetzt die individuelle `project.color` aus den Settings statt einer rang-basierten Akzentfarben-Abstufung — die dort konfigurierte Farbe wurde bisher nirgends im Frontend genutzt |
| v4.14   | Design-Themes als echte Einstellmöglichkeit: Settings-Karte mit 4 wählbaren Themes (Original/Neongrün als Standard, Puls, Archiv, Loop), `useTheme()`-Hook + `[data-theme]`-CSS-Overrides, sofort wirksam ohne Reload. Voraussetzung dafür: alle fest verdrahteten Akzentfarben in TimerPage/MailPage/ExportPage/WeekPage/StatsPage auf `var(--accent)`/`color-mix()` umgestellt. `--accent-dim`-Varianten jetzt einmalig per `color-mix()` aus `--accent` abgeleitet statt pro Theme dupliziert. Favicon zurück auf Grün (statisch, themeunabhängig) |

| v4.15   | Design-Themes: Farbe und Schrift jetzt unabhängig wählbar statt als festes Paar — neues `[data-font]`-Attribut/`FontCard` neben dem bestehenden `[data-theme]`/`ThemeCard`. `useTheme()`/`useFont()` teilen sich jetzt eine gemeinsame `useAttrSetting()`-Hilfsfunktion in `hooks/useTheme.js` |

**Aktuelle Version: v4.15**
