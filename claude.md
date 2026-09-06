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
        │               (persistiert via Bind-Mount ./data, s. docker-compose.yml)
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
    ├── Dockerfile                   # Multi-Stage: node build → nginx (+ openssl fürs Zertifikat)
    ├── nginx.conf                   # Static files + /api proxy, Server-Blöcke für Port 80 + 443
    ├── locations.conf               # Gemeinsame Locations für die 80/443-Server-Blöcke (s. „HTTPS")
    ├── docker-entrypoint.sh         # Erzeugt selbstsigniertes TLS-Zertifikat beim ersten Start (s. „HTTPS")
    ├── package.json
    ├── vite.config.js
    ├── index.html                   # PWA meta tags
    ├── public/
    │   ├── manifest.json             # Referenziert icon-192.png/icon-512.png — beide müssen bei Änderung an favicon.svg manuell neu gerendert werden (kein Build-Step dafür)
    │   ├── favicon.svg               # Uhr-Icon (Accent-Grün auf dunklem Grund), gleiche Formsprache wie IcoTimer
    │   ├── favicon-dev.svg           # Gleiche Form, Rot statt Grün — nur lokal aktiv (s. „Docker Multi-Stage")
    │   ├── icon-192.png              # Aus favicon.svg gerendert — Android/Chrome "App installieren" (Manifest-Icon)
    │   ├── icon-512.png              # Dito, größere Auflösung (Manifest-Icon)
    │   ├── apple-touch-icon.png      # 180×180, dito — iOS Safari ignoriert das Manifest weitgehend und braucht einen eigenen <link rel="apple-touch-icon"> in index.html
    │   └── sw.js                     # Erster Service Worker im Projekt — push-Event → showNotification(), notificationclick → App fokussieren/öffnen (s. „Push-Benachrichtigungen im Detail")
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
        │   ├── useIdleDetection.js  # Erkennt Inaktivität via visibilitychange, liefert Deduct-Prompt, Schwelle pro Gerät konfigurierbar
        │   └── usePushSubscription.js # Permission anfragen, VAPID Key holen, pushManager.subscribe(), Subscription ans Backend senden (s. „Push-Benachrichtigungen im Detail")
        └── pages/
            ├── TimerPage.jsx        # Timer + Pomodoro-Card + manuelle Einträge + Tagesnotiz + Report
            ├── WeekPage.jsx         # Wochenübersicht + Balkendiagramm
            ├── HistoryPage.jsx      # Verlauf mit Datums-, Projekt- und Aufgaben-Filter
            ├── StatsPage.jsx        # Monatsstatistiken + Recharts, Projekt-Filter im Balkendiagramm, Überstunden Pro Tag/Pro Projekt
            ├── MailPage.jsx         # Mail-Status + Report senden + IMAP Poll + Log
            ├── ExportPage.jsx       # CSV / JSON Export + Tageszusammenfassung (Text, Vorschau + .txt-Download)
            ├── SettingsPage.jsx     # Projektverwaltung (neu/umbenennen/Farbe/archiv) + Pomodoro- + Idle- + Push-Einstellungen (PushSettingsCard)
            ├── OvertimeBanner.jsx   # Überstunden-Anzeige (compact + full)
            ├── ManualEntryModal.jsx # Shared Modal für manuelle Einträge (rechnet lokale Zeit ↔ UTC um, s. useTimer.js)
            └── EditEntryModal.jsx   # Shared Modal zum Bearbeiten bestehender Einträge — in Timer, Verlauf und Woche
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

### `push_subscriptions`
| Spalte     | Typ      | Beschreibung                                        |
|------------|----------|-----------------------------------------------------|
| id         | Integer  | Primary Key                                         |
| endpoint   | String   | Push-Endpoint-URL des Browsers, unique              |
| p256dh     | String   | Public Key der Subscription (Verschlüsselung)       |
| auth       | String   | Auth-Secret der Subscription                        |
| created_at | DateTime | Auto                                                |

### `push_settings` (Singleton, id=1)
| Spalte           | Typ     | Beschreibung                                                    |
|------------------|---------|------------------------------------------------------------------|
| id               | Integer | Immer `1`                                                       |
| interval_seconds | Integer | Abstand zwischen periodischen Pushes (Default `240`, s. `_push_loop()`) |

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
| GET    | /api/entries/descriptions | Query: `project?`, `limit` (Default 15). Distinkte `description`-Werte, sortiert nach Häufigkeit dann Aktualität (letztes Datum) — Datengrundlage für Autocomplete-Vorschläge |

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
| DELETE | /api/mail/log         | Löscht gesamten Mail-Log unwiderruflich |
| GET    | /api/mail/config      | Sanitisierte Konfig (ohne Passwörter) |
| POST   | /api/mail/poll        | Manuellen IMAP-Poll triggern, gibt `{ok, parsed, skipped, errors}` zurück |

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

### Admin
| Method | Path            | Beschreibung                                                             |
|--------|-----------------|---------------------------------------------------------------------------|
| POST   | /api/admin/reset | Body: `{ confirm: "ZURUECKSETZEN" }`. Löscht **alle** `time_entries`/`day_notes`/`mail_log`/`projects` und setzt Pomodoro-Settings/-State zurück; danach werden die 6 Standardprojekte (`DEFAULT_PROJECTS`) neu angelegt. Falsches/fehlendes `confirm` → 400, keine Änderung |

### Push
| Method | Path                    | Beschreibung                                                          |
|--------|-------------------------|-------------------------------------------------------------------------|
| GET    | /api/push/public-key    | VAPID Public Key (für `pushManager.subscribe()`)                     |
| POST   | /api/push/subscribe     | Body: `{ endpoint, keys: { p256dh, auth } }` — Upsert per `endpoint`  |
| POST   | /api/push/unsubscribe   | Body: `{ endpoint }`                                                  |
| GET    | /api/push/settings      | `{ interval_seconds }` — serverweit, gilt für alle Geräte             |
| PUT    | /api/push/settings      | Body: beliebige Teilmenge (aktuell nur `interval_seconds`)             |

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
IMAP_POLL_INTERVAL=3600    # Sekunden — Backup; primärer Weg ist der manuelle "Jetzt abrufen"-Button

# Web Push (VAPID) – Push-Benachrichtigungen bei laufendem Timer/Pomodoro
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CLAIM_EMAIL=du@example.com   # für den mailto:-Claim gegenüber dem Push-Dienst
```

Alle Variablen optional — fehlen Credentials, ist Mail bzw. Push deaktiviert. VAPID-Schlüsselpaar einmalig generieren (z.B. via `py_vapid`, das mit `pywebpush` installiert wird) und lokal in `.env` eintragen.

---

## Projektverwaltung (SettingsPage)

- Projekte werden in der DB gespeichert und beim ersten Start mit 6 Defaults geseedet
- `useProjects()` Hook — lädt einmal, cached im Modul-Scope, verteilt Updates via Listener-Array
- `invalidateProjects()` — leert Cache und triggert Reload in allen Komponenten
- `useProjectNames()` — gibt nur `names: string[]` zurück (für Select-Dropdowns)
- Farben: 12 Preset-Farben, Inline-Picker direkt am Eintrag
- Archivieren statt Löschen wenn Projekt in Einträgen verwendet
- Reihenfolge per `PUT /api/projects/reorder` mit ID-Array
- **Gefahrenzone** (unten auf der Settings-Seite): `DangerZoneCard` in `SettingsPage.jsx` — Reset-Button ist erst aktiv, nachdem exakt `ZURUECKSETZEN` in ein Bestätigungsfeld getippt wurde, plus zusätzlicher `window.confirm()`-Dialog davor. Ruft `POST /api/admin/reset` und lädt danach die App per vollem Reload (`window.location.href = '/'`) neu. Die Bestätigungs-Zeichenkette wird bewusst auch serverseitig geprüft (nicht nur im Frontend), damit ein Reset nie allein durch einen rohen `POST`-Request ohne die UI ausgelöst werden kann

---

## Verlauf- und Stats-Filter

**HistoryPage** — zusätzlich zum Datumsbereich (`from`/`to`) zwei clientseitige Filter über den bereits geladenen Einträgen:
- **Projekt** — Dropdown (`useProjectNames()`), exakte Übereinstimmung
- **Aufgabe** — Freitextsuche, case-insensitive `includes()` auf `description`
- "Filter zurücksetzen"-Button erscheint, sobald einer der beiden aktiv ist

**StatsPage** — die "Nach Projekt"-Balken (und die Legende darunter) sind anklickbar (`selectedProject`-State, Klick auf denselben Balken hebt die Auswahl wieder auf):
- Ausgewählter Balken/Legendeneintrag wird hervorgehoben, alle anderen abgedunkelt
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

**Benachrichtigung bei Phasenwechsel:** `usePomodoro.js` erkennt Phasenwechsel durch Vergleich mit dem vorherigen Poll-Ergebnis (Polling alle 5s + bei `visibilitychange`/`focus`, gleiches Muster wie der aktive Timer) und feuert dann optional Sound (`playPhaseSound()`) und/oder Browser-`Notification` (`notifyPhaseChange()`), je nach `sound_enabled`/`notifications_enabled` in den Pomodoro-Settings:
- **Ton:** reiner Web-Audio-API-Oszillator-Beep (`beep()`), kein Audio-Asset im Repo nötig — zwei kurze hohe Töne (880 Hz) beim Start einer **Arbeitsphase**, ein einzelner tieferer Ton (660 Hz) bei **Pausen**, akustisch unterscheidbar.
- **Benachrichtigungen:** lokale Browser-`Notification` ("Epoch — Pomodoro" / "{Phase} beginnt"). Permission wird beim ersten Start einer Session bzw. beim Aktivieren in den Settings angefragt.

Beide laufen **rein clientseitig im offenen Tab** (Erkennung nur per Polling-Vergleich, kein Hintergrund-Mechanismus) — im Gegensatz zu den Web-Push-Benachrichtigungen (s. „Push-Benachrichtigungen im Detail" unten), die auch bei geschlossenem Tab/im Hintergrund ankommen. Beide Systeme laufen unabhängig nebeneinander und können gleichzeitig aktiv sein.

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

## Push-Benachrichtigungen im Detail

Mobiles Pendant zum Schwebenden Fenster (siehe oben) — Document Picture-in-Picture ist Desktop-only, auf dem Handy übernimmt eine **Web-Push-Notification** die laufende Timer-/Pomodoro-Anzeige, solange eine Session aktiv ist. Kein echtes "sticky/ongoing" Notification wie bei nativen Apps möglich (Nutzer kann sie wegwischen, sie kommt erst beim nächsten Update-Zyklus wieder) — aber der beste erreichbare Kompromiss auf Mobil-Web. Führt den **ersten Service Worker** im Projekt ein (`public/sw.js`) — bricht mit der bisherigen bewussten Einschränkung „PWA ohne Service Worker".

**Subscription-Flow:** `usePushSubscription()` (`hooks/usePushSubscription.js`) fragt Notification-Permission an, holt den VAPID Public Key von `GET /api/push/public-key`, ruft `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` auf und schickt die Subscription (`endpoint`, `keys.p256dh`, `keys.auth`) an `POST /api/push/subscribe` — Upsert per `endpoint` in `push_subscriptions`. Toggle „Push bei laufendem Timer" in `PushSettingsCard` (`SettingsPage.jsx`), pro Gerät (jede Browser-Subscription ist geräte-/browserspezifisch, kein globaler Schalter).

**Versand (`main.py`):** `_send_push_to_all()` verschickt per `pywebpush`/VAPID an alle gespeicherten Subscriptions; entfernt dabei automatisch abgelaufene/widerrufene Subscriptions (HTTP 404/410 von der Push-Service-Antwort). Zwei Auslöser:
1. **`_push_loop()`** — Hintergrund-Task analog `_pomodoro_loop()`/`_imap_loop()`, prüft alle 20s, sendet aber nur alle `push_settings.interval_seconds` (Default 240s ~4 Min, wegen Akku/Traffic; konfigurierbar in den Settings, s. `PushSettingsCard` → `GET`/`PUT /api/push/settings`) solange ein Timer läuft (nicht pausiert) oder eine Pomodoro-Phase aktiv ist.
2. **Sofort bei Pomodoro-Phasenwechsel** — Aufruf direkt in `_advance_pomodoro_phase()`, analog zur lokalen Browser-Notification in `usePomodoro.js`, aber serverseitig (funktioniert auch wenn die App im Hintergrund/geschlossen ist).

**Service Worker (`public/sw.js`):** `push`-Event parst das JSON-Payload (`{title, body}`) und zeigt es via `registration.showNotification()` mit festem `tag: 'epoch-timer'` — ersetzt die vorherige Notification statt zu stapeln. `notificationclick` fokussiert ein offenes Fenster oder öffnet die App neu.

**HTTPS Pflicht** für Service Worker + Push (außer `localhost`, gilt als sicherer Kontext). iOS nur wenn die PWA per „Zum Home-Bildschirm hinzufügen" installiert ist, iOS ≥ 16.4, stärker eingeschränkt als Android.

**Achtung beim Testen über HTTPS mit dem selbstsignierten Zertifikat (`:3443`, s. „HTTPS (selbstsigniertes Zertifikat)"):** Die normale Klick-durch-Ausnahme im Browser ("Trotzdem fortfahren" bei der Zertifikatswarnung) reicht für den Seitenaufruf, **aber nicht** für die Service-Worker-Registrierung — die verlangt eine echt vertrauenswürdige Zertifikatskette. Ohne das schlägt `navigator.serviceWorker.register('/sw.js')` in `main.jsx` mit `SecurityError: ... An SSL certificate error occurred when fetching the script.` fehl, und zwar **lautlos** (der `.catch()` loggt den Fehler nur in die Konsole, zeigt aber keinen sichtbaren Hinweis in der UI) — der Push-Toggle bleibt dann einfach dauerhaft deaktiviert, ohne erkennbaren Grund. Fix: das Zertifikat `./data/certs/fullchain.pem` auf jedem Testgerät zusätzlich als vertrauenswürdige CA importieren (einmalig pro Gerät):

- **Linux-Desktop (NSS-Truststore, gilt für Chrome/Chromium/Brave):**
  ```bash
  sudo apt install libnss3-tools   # einmalig, stellt certutil bereit
  certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Epoch Dev CA" -i ./data/certs/fullchain.pem
  ```
  Browser danach **komplett neu starten** (nicht nur Tab neu laden) — NSS-Änderungen greifen erst dann.
  Firefox hat einen eigenen, separaten Zertifikatsspeicher: `about:preferences#privacy` → „Zertifikate anzeigen" → „Zertifizierungsstellen" → „Importieren".

- **Android:** Zertifikatsdatei aufs Handy bringen (z. B. kurzzeitig über den laufenden `frontend`-Container zum Download bereitstellen: `docker cp data/certs/fullchain.pem timetracker-frontend:/usr/share/nginx/html/epoch-dev-ca.crt`, dann im Handy-Browser `http://<LAN-IP>:3000/epoch-dev-ca.crt` herunterladen — Datei danach aus dem Container wieder entfernen). Einstellungen → Sicherheit → **Verschlüsselung & Anmeldedaten** → **Zertifikat installieren** → **CA-Zertifikat** → heruntergeladene Datei wählen. Android warnt danach dauerhaft mit einem Schild-Symbol in der Statusleiste ("Netzwerk wird möglicherweise überwacht") — erwartetes Verhalten bei jeder installierten User-CA, kein Fehler.

- **iOS:** Zertifikat als Profil per Safari herunterladen (z. B. über denselben Download-Weg wie bei Android) → Einstellungen → Profil geladen → installieren. **Zusätzlicher Schritt nötig**, den iOS separat abfragt: Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen → volles Vertrauen für das Zertifikat aktivieren — ohne diesen zweiten Schritt bleibt es trotz installiertem Profil nicht vertrauenswürdig.

Ist das Zertifikat einmal auf einem Gerät als CA vertraut, braucht dieses Gerät für zukünftige Sessions keinen erneuten Import — die Subscription bleibt in `push_subscriptions` gespeichert und unabhängig davon, von welchem Gerät/Port aus der Timer später gestartet wird (`_send_push_to_all()` sendet ohnehin an alle gespeicherten Subscriptions).

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

### Eingehend (IMAP) — Betreff-Pflicht
Betreff muss `Zeiterfassung` enthalten (Groß-/Kleinschreibung egal), sonst wird die Mail komplett ignoriert (Status `skipped` im Mail-Log, kein Fehler-Reply). So verarbeitet Epoch keine fremde Post im dedizierten Postfach (Bounces, Antworten, Spam).

### Eingehend (IMAP) — Pflichtformat (Body)
```
Datum      | Start | Ende  | Projekt     | Beschreibung
2026-06-01 | 09:00 | 10:00 | Support     | Planung Roadmap Q3
2026-06-01 | 10:30 | 12:00 | Entwicklung | Auth-System
```
**Alle 5 Spalten Pflicht.** Beschreibung darf nicht leer sein.
Zeilen mit `>` oder `#` werden ignoriert.

Erfolgreich verarbeitete Mails (`parsed`) werden auf dem IMAP-Server per `\Deleted`-Flag + `expunge()` endgültig gelöscht statt nur als gelesen markiert. Mails mit `skipped`/`error`-Status bleiben im Postfach (als gelesen markiert) für Debugging erhalten.

### Fehlerbehandlung — Alles-oder-nichts
Bei einer einzigen ungültigen Zeile:
- Gesamte Mail wird abgelehnt — kein Eintrag wird importiert
- `MailParseError(lineno, line, reason)` mit `user_message()`
- `_diagnose_line(line)` — spezifischer Fehlergrund
- Falls SMTP konfiguriert: automatische Fehler-Mail zurück an Absender

---

## Frontend-Design-System

**CSS-Variablen:**
```css
--bg: #0a0a0a      --bg2: #111        --bg3: #1a1a1a    --bg4: #222
--border: #2a2a2a  --border2: #333
--text: #e8e4dc    --text2: #888880   --text3: #555550
--accent: #c8f060  --accent-dim: rgba(200,240,96,.12)
--red: #ff4444     --red-dim: rgba(255,68,68,.12)
--amber: #ffaa00   --amber-dim: rgba(255,170,0,.12)
--sans: 'Archivo'  --mono: 'DM Mono'
--r: 4px           --rl: 8px
```

**Source-Badges:**
| `source` | Herkunft | Farbe              | Label   |
|----------|----------|--------------------|---------|
| 0        | Timer    | (kein Badge)       | —       |
| 1        | Manuell  | `#6699ff` (Blau)   | manuell |
| 2        | E-Mail   | `#ffaa00` (Amber)  | E-Mail  |

**Navigation:** 7-Tab Bottom Nav — Timer · Woche · Verlauf · Stats · Mail · Export · Settings

---

## Beschreibungs-Autocomplete

Alle drei Beschreibungs-Felder (Timer-Start, manueller Eintrag, Eintrag bearbeiten — alle in `TimerPage.jsx`) nutzen ein natives HTML `<datalist>`, gespeist über `useDescriptionSuggestions(project)`. Der Hook ruft bei jeder Änderung von `project` `GET /api/entries/descriptions?project=...` neu ab und schlägt so die häufigsten (dann aktuellsten) bisher für dieses Projekt verwendeten Beschreibungen vor — bewusst kein Custom-Dropdown-Widget, da der Browser Filterung/Tastaturnavigation bereits kostenlos mitbringt.

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

**Dev-vs-Prod-Favicon:** Build-`ARG APP_ENV` (Default `production`) wird als `VITE_APP_ENV` in den Vite-Build eingebacken. Lokal setzt eine **gitignorte** `docker-compose.override.yml` (wird von Docker Compose automatisch mitgeladen, sobald sie neben `docker-compose.yml` liegt) `APP_ENV: development` für den `frontend`-Build — dadurch zeigt der Tab lokal ein rotes statt das neongrüne Favicon (`favicon-dev.svg`). Die Override-Datei landet nie im Git-Verlauf und wird von `sync_to_server.sh` (nutzt `.gitignore` als rsync-Exclude-Liste) nie mitkopiert, der Server baut also immer mit `APP_ENV=production`.

### HTTPS (selbstsigniertes Zertifikat)

Manche Browser-APIs verlangen einen **Secure Context** (HTTPS oder `localhost`) — z.B. Document Picture-in-Picture fürs Schwebende Fenster (s. „Bekannte Einschränkungen"), künftig auch der geplante Service Worker für Push (s. „TODO"). Über reines HTTP auf einer LAN-IP/einem Hostnamen fehlt das, daher läuft Nginx im `frontend`-Container jetzt zusätzlich auf Port 443:

- **Zertifikat:** `frontend/docker-entrypoint.sh` erzeugt beim allerersten Start ein selbstsigniertes Zertifikat (10 Jahre gültig) via `openssl`, falls im Bind-Mount `./data/certs` noch keins liegt — bleibt danach über Rebuilds/Neustarts hinweg erhalten.
- **`SSL_SAN`** (`.env`) legt fest, für welche Hostnamen/IPs das Zertifikat gültig ist, z.B. `SSL_SAN=IP:10.0.0.10,DNS:localhost,IP:127.0.0.1`. Ohne passenden Eintrag für die tatsächlich aufgerufene Adresse blockt der Browser die Verbindung komplett (nicht nur eine Warnung).
- **Port:** `docker-compose.yml` mappt `3443:443` (fix, nicht wie der HTTP-Port per `HOST_PORT` parametrisiert).
- **Browser-Warnung:** Da selbstsigniert, zeigt jeder Browser beim ersten Aufruf eine Zertifikatswarnung — einmal pro Gerät/Browser bestätigen.
- **Mehrere Zielserver:** Jeder Server braucht sein **eigenes** `SSL_SAN` für seine eigene IP/seinen Hostnamen (lokal-only Deploy-Tooling in `deploy/`, s. Versionierungs-Hinweis unten — nicht Teil des öffentlichen Repo-Verlaufs). Das dortige Sync-Skript kopiert `.env` bei jedem Sync komplett neu — dabei bleibt ein auf dem Zielserver bereits gesetzter `SSL_SAN`-Wert automatisch erhalten (wird nach dem Kopieren zurückgeschrieben), oder lässt sich explizit als Env-Var beim Sync-Aufruf überschreiben. Ohne beides würde der zuerst kopierte Wert des Quell-Servers stehen bleiben — das Zertifikat wäre dann für die falsche Adresse gültig.

---

## Bekannte Einschränkungen

- **SQLite** — kein paralleler Schreibzugriff; für Einzel-User ausreichend
- **IMAP-Polling** — blockierender Call in `run_in_executor`; bei sehr vielen Mails spürbar
- **Zeitzone** — Backend speichert konsequent UTC (Timer wie manuelle/bearbeitete Einträge, s. `localTimeToUTC`/`utcToLocalTime` in `useTimer.js`), Anzeige rechnet immer in die Browser-Lokalzeit um; bei Zugriff aus unterschiedlichen Zeitzonen zeigt jeder Browser dieselbe absolute Zeit entsprechend seiner eigenen Zeitzone an (kein DB-Problem, aber ggf. gewöhnungsbedürftig bei Multi-Timezone-Nutzung)
- **Keine Authentifizierung** — für lokales Netz ausreichend; für Internet: Basic Auth in Nginx empfohlen
- **PWA ohne Service Worker** — kein Offline-Betrieb
- **Schwebendes Fenster (Document Picture-in-Picture)** — nur Desktop-Chromium (Chrome/Edge/Brave ≥ 116); auf Mobil (Android/iOS) fehlt die API in allen Browsern, Button dort ausgeblendet. Zusätzlich verlangt die API einen **Secure Context** (HTTPS oder `localhost`) — über reines HTTP auf einer LAN-IP/einem Hostnamen bleibt der Button ausgeblendet, selbst in einem unterstützten Browser (s. „HTTPS (selbstsigniertes Zertifikat)")
- **Projekte in Einträgen** — Umbenennen eines Projekts ändert **nicht** die bestehenden Einträge (String-Referenz); bei Umbenennung bleibt der alte Name in historischen Einträgen erhalten
- **Idle-Erkennung** — basiert auf `visibilitychange`, nicht auf echter Maus-/Tastatur-Inaktivität; erkennt zuverlässig Rechner sperren/Tab wechseln, aber nicht "Tab bleibt offen sichtbar, aber Nutzer ist einfach weg" (z.B. Bildschirm bleibt an); Schwelle ist in den Settings konfigurierbar, aber **pro Gerät** (localStorage) — synct nicht zwischen Geräten wie die Pomodoro-Settings

---

## TODO / Geplante Features

### Backup-Lösung für SQLite-Volume

Aktuell kein automatisiertes Backup — die DB liegt ausschließlich im Docker-Volume `timetracker-data` (lokal auf dem Host, s. Architektur oben), ein Datenverlust bei Volume-Löschung/Host-Crash wäre nicht wiederherstellbar.

**Schritte:**
1. Backup-Skript (`backup.sh`): Hilfscontainer mountet Volume + Zielverzeichnis, packt `timetracker.db` als `tar.gz` mit Datumsstempel
2. Vor dem Backup Backend kurz stoppen (`docker compose stop backend`) für konsistenten Snapshot, danach wieder starten — Alternative `docker cp` aus laufendem Container ist einfacher, aber nicht garantiert konsistent
3. Rotation/Aufbewahrung klären (z. B. letzte 7 Tage + letzte 4 Wochen behalten, ältere löschen)
4. Ablagespeicherort für Backups festlegen (externe Platte, NAS, Cloud-Storage?) — noch offen
5. Automatisierung per Cron auf dem Host, der `docker compose` ausführt

**Aufwand:** ~1–2 Stunden für Skript + Cron, je nach gewähltem Ablageort ggf. mehr.

**Zu beachten:**
- Skript muss außerhalb des Repos/Containers laufen (Host-Cron), da es auf den Docker-Socket/Volume-Mount zugreift
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

### Branch-Badge in der Sidebar
Bei einem Build von einem anderen Branch als `main` zeigt die Sidebar unter der Versionsnummer ein Amber-Badge mit dem Branch-Namen (⎇), damit lokale Test-/Feature-Builds nicht mit `main` verwechselt werden. Wird per `git rev-parse --abbrev-ref HEAD` in `vite.config.js` zur Build-Zeit ermittelt (`__GIT_BRANCH__`) — Docker-Build hat kein `.git` im Build-Context (`context: ./frontend`), daher dort Fallback auf `VITE_GIT_BRANCH` (gesetzt via Dockerfile `ARG GIT_BRANCH`, Default `main`). Für sichtbares Badge im Docker-Build explizit mitgeben:
```bash
GIT_BRANCH=$(git branch --show-current) docker compose up --build frontend
```
`npm run dev`/`vite build` außerhalb Docker erkennen den Branch automatisch, kein Env-Var nötig.

### Backup
```bash
# im Projektverzeichnis ausführen (dort liegt ./data neben docker-compose.yml)
tar czf backup-$(date +%Y%m%d).tar.gz -C ./data .
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

## Versionierung

Es gibt **zwei getrennte Versionszähler**, die bewusst unterschiedlich oft hochgezählt werden:

- **App-Version** (`APP_VERSION` in `frontend/src/App.jsx`, sichtbar in der Sidebar) — echtes Semver `MAJOR.MINOR.PATCH`, wird **nur bei echten Code-/Feature-Änderungen** hochgezählt, nicht bei reinen Doku-Korrekturen.
- **Doku-Version** (diese Datei) — die alte `v4.x`-Zählung, läuft unverändert weiter und wird bei **jeder** Änderung an `claude.md` hochgezählt, egal ob reine Doku-Korrektur oder Begleitdoku zu einem Feature.

Bis `v4.12`/App-Anzeige `v4.12` liefen beide Zähler synchron (ein gemeinsamer Zähler). Ab hier laufen sie auseinander — `v4.12` ist der letzte gemeinsame Stand, `0.1.12` der Startpunkt der neuen eigenständigen App-Version.

**Semver-Regel für die App-Version (ab `0.2.0`):**
- **Neues Feature** → MINOR hoch, PATCH auf `0` zurück (z.B. `0.1.13` → `0.2.0`)
- **Fix/Kleinigkeit ohne neues Feature** → nur PATCH hoch (z.B. `0.2.0` → `0.2.1`)
- **MAJOR** (`1.0.0` etc.) → nie eigenmächtig, vorher immer beim Nutzer nachfragen

**Aktuelle App-Version: 0.7.0**
**Aktuelle Doku-Version: v4.23**

### App-Versionshistorie

| Version | Änderungen |
|---------|------------|
| 0.1.12  | Startpunkt der eigenständigen App-Versionierung (vorher gemeinsam mit der Doku-Version gezählt, zuletzt als „v4.12"). Kein Code-Unterschied zum vorherigen Stand — reine Umstellung der Zählweise |
| 0.1.13  | Gefahrenzone-Karte umbenannt zu „Datenbank zurücksetzen" (kein Warndreieck/„Gefahrenzone"-Framing mehr). `POST /api/admin/reset` sichert die bestehende SQLite-Datei jetzt automatisch vor dem Zurücksetzen als Zeitstempel-Kopie (`timetracker_backup_<YYYYMMDD_HHMMSS>.db`) im selben Datenverzeichnis |
| 0.2.0   | Beschreibungs-Autocomplete: neuer Endpoint `GET /api/entries/descriptions` (Projekt-gefiltert, sortiert nach Häufigkeit/Aktualität), natives `<datalist>` an allen drei Beschreibungs-Feldern (Timer-Start, manueller Eintrag, Eintrag bearbeiten) |
| 0.3.0   | Rotes Favicon in der lokalen Dev-Umgebung zur Unterscheidung von Produktion (grün): `favicon-dev.svg`, Umschaltung in `main.jsx` bei `import.meta.env.DEV` (Vite-Dev-Server) **oder** `VITE_APP_ENV === 'development'` (Docker-Build). Neues Dockerfile-`ARG APP_ENV` (Default `production`), lokal per gitignorter `docker-compose.override.yml` auf `development` gesetzt — landet nie auf dem Server |
| 0.4.0   | Mail-Import: eingehende Mails werden nur noch verarbeitet, wenn der Betreff „Zeiterfassung" enthält (sonst Status `skipped`, kein Fehler-Reply) — schützt das dedizierte Postfach vor fremder Post. Erfolgreich verarbeitete Mails werden per `\Deleted`+`expunge()` vom IMAP-Server gelöscht statt nur als gelesen markiert. `POST /api/mail/poll` liefert jetzt `{parsed, skipped, errors}`, der „Jetzt abrufen"-Button zeigt das Ergebnis direkt an. Neuer `DELETE /api/mail/log`-Endpoint + „Log löschen"-Button (mit `window.confirm()`). `IMAP_POLL_INTERVAL`-Default auf 3600s (1h) als Backup erhöht — primärer Weg ist der manuelle Button |
| 0.4.1   | Fix: manuelle/bearbeitete Zeiteinträge wurden ohne Zeitzonen-Umrechnung gespeichert — die im `<input type="time">` eingegebene lokale Uhrzeit landete unverändert als vermeintlich-UTC in der DB, wodurch Anzeige und erneutes Bearbeiten stets um den UTC-Offset verschoben waren und eine Korrektur nie ankam. Neue Helper `localTimeToUTC`/`utcToLocalTime` (`hooks/useTimer.js`) rechnen jetzt konsequent um. `EditEntryModal` als eigene Komponente extrahiert (vorher in `TimerPage.jsx` dupliziert) und zusätzlich in Verlauf und Woche verdrahtet — Zeitslots sind jetzt überall bearbeitbar, nicht nur auf der Timer-Seite |
| 0.5.0   | HTTPS mit selbstsigniertem Zertifikat im bestehenden Nginx (`frontend`-Container): zweiter Server-Block auf Port 443 (extern `3443`), Zertifikat wird beim ersten Start automatisch erzeugt (`docker-entrypoint.sh`), gültige Hostnamen/IPs über `SSL_SAN` (`.env`) konfigurierbar. Schafft den Secure Context, den z.B. das Schwebende Fenster (Document Picture-in-Picture) außerhalb von `localhost` braucht (s. „Bekannte Einschränkungen") — vorher über reines HTTP auf einer LAN-IP nicht verfügbar, unabhängig vom Browser |
| 0.5.1   | Fix: PWA-Icon fürs Installieren auf dem Handy fehlte — `manifest.json` referenzierte `icon-192.png`/`icon-512.png`, die nie existierten (nur die `favicon.svg` war vorhanden), daher zeigte „Zum Startbildschirm hinzufügen" kein Icon. Beide PNGs aus der `favicon.svg` gerendert, dazu `apple-touch-icon.png` (180×180) ergänzt und in `index.html` verlinkt (iOS Safari nutzt das Manifest kaum und braucht einen eigenen `<link>`-Tag) |
| 0.6.0   | Merge `feature/push-notifications`: Web-Push-Benachrichtigungen für laufenden Timer/Pomodoro als Mobile-Pendant zum Schwebenden Fenster (erster Service Worker, `push_subscriptions`-Tabelle, `/api/push/*`, VAPID/`pywebpush`, `PushSettingsCard`), dazu Branch-Badge in der Sidebar für Builds abseits von `main` (s. „Push-Benachrichtigungen im Detail") |
| 0.6.1   | Fix: Fehlschlagende Service-Worker-Registrierung (z. B. `SecurityError` bei nicht vertrauenswürdigem HTTPS-Zertifikat) wurde in `main.jsx` bisher komplett lautlos verschluckt (`.catch(() => {})`), wodurch der Push-Toggle ohne jeden erkennbaren Grund dauerhaft deaktiviert blieb. Loggt den Fehler jetzt in die Konsole (`console.error`) — kein UI-Verhalten geändert, nur Diagnose beim Debuggen erleichtert (s. „Push-Benachrichtigungen im Detail") |
| 0.7.0   | Push-Intervall konfigurierbar: neue Singleton-Tabelle `push_settings` (`interval_seconds`, Default 240), `GET`/`PUT /api/push/settings`, `_push_loop()` liest den Wert jetzt aus der DB statt der bisherigen fest verdrahteten `PUSH_INTERVAL_SECONDS`-Konstante. UI dafür in `PushSettingsCard` (`SettingsPage.jsx`) — serverweite Einstellung, gilt für alle Geräte gemeinsam (anders als der Push-Subscribe-Toggle, der pro Gerät ist) |

### Doku-Versionshistorie

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
| v4.9    | Docker-Volume durch Bind-Mount `./data` ersetzt (kein Docker-Volume mehr), Backup-Doku entsprechend angepasst |
| v4.10   | Nur Doku-Sync: Healthcheck-Intervall (30s→5m, Retries 3→1), API-Smoke-Tests (`backend/tests/test_api.sh`) und fehlende Versionshistorie v4.7–v4.9 ergänzt. Nachträglich: Design-Themes (frühere v4.11–v4.15) bewusst zurückgebaut auf einziges festes Design — Neongrün (`#c8f060`) bleibt, Sans-Schrift jedoch von Syne auf Archivo geändert |
| v4.11   | Backup-TODO für SQLite-Datenverzeichnis aus der Doku entfernt — wird auf einem anderen, alternativen Weg gelöst (Doku, kein Code) |
| v4.12   | Neue Gefahrenzone in den Settings: Datenbank auf Auslieferungszustand zurücksetzen (`POST /api/admin/reset`, `DangerZoneCard`) — löscht alle Zeiteinträge/Notizen/Mail-Log/Projekte, seedet die 6 Standardprojekte + Pomodoro-Defaults neu. Bestätigung per Eingabe von „ZURUECKSETZEN" (Frontend + serverseitig geprüft) plus zusätzlichem `window.confirm()` |
| v4.13   | App-Version und Doku-Version entkoppelt (s. „Versionierung" oben) — Doku-only-Änderungen zählen ab jetzt nur noch diesen `v4.x`-Zähler hoch, nicht mehr `APP_VERSION` |
| v4.14   | Gefahrenzone-Karte in den Settings umbenannt zu „Datenbank zurücksetzen", automatisches Backup der SQLite-Datei vor dem Reset (s. App-Versionshistorie 0.1.13) |
| v4.15   | Beschreibungs-Autocomplete für Timer-Start/manuellen Eintrag/Eintrag bearbeiten, neuer Abschnitt „Beschreibungs-Autocomplete" (s. App-Versionshistorie 0.2.0) |
| v4.16   | Rotes Dev-Favicon zur Unterscheidung von der Produktivumgebung, `docker-compose.override.yml`-Mechanismus im Abschnitt „Docker Multi-Stage (Frontend)" ergänzt (s. App-Versionshistorie 0.3.0) |
| v4.17   | Mail-Import: Betreff-Pflicht „Zeiterfassung", Server-seitiges Löschen nach erfolgreicher Verarbeitung, Poll-Ergebnis-Feedback, Mail-Log löschbar (s. App-Versionshistorie 0.4.0) |
| v4.18   | Fix Zeitzonen-Offset bei manuellen/bearbeiteten Zeiteinträgen, Bearbeiten-Funktion jetzt auch in Verlauf und Woche (s. App-Versionshistorie 0.4.1) |
| v4.19   | HTTPS mit selbstsigniertem Zertifikat dokumentiert (neuer Abschnitt „HTTPS (selbstsigniertes Zertifikat)"), Dateistruktur um `EditEntryModal.jsx`/`locations.conf`/`docker-entrypoint.sh` ergänzt, veraltete Zeitzonen-Zeile in „Bekannte Einschränkungen" korrigiert, PiP-Einschränkung um Secure-Context-Hinweis ergänzt, Push-TODO aktualisiert (HTTPS-Voraussetzung erfüllt) (s. App-Versionshistorie 0.5.0) |
| v4.20   | Merge des `feature/push-notifications`-Branches: Web-Push-Notifications als Mobile-Pendant zum Schwebenden Fenster (erster Service Worker im Projekt `public/sw.js`, `push_subscriptions`-Tabelle, `/api/push/*`-Endpoints, `_push_loop()` + Sofort-Push bei Pomodoro-Phasenwechsel per `pywebpush`/VAPID, `PushSettingsCard` mit Subscribe-Toggle) sowie Branch-Badge in der Sidebar (⎇, Amber) für Builds abseits von `main` — Branch-Name via `git rev-parse` in `vite.config.js` zur Build-Zeit ermittelt, Docker-Fallback über `VITE_GIT_BRANCH`/Dockerfile-`ARG GIT_BRANCH` (s. App-Versionshistorie 0.6.0) |
| v4.21   | Push-Notification-Testing über HTTPS/`:3443` dokumentiert: Klick-durch-Ausnahme bei selbstsigniertem Zertifikat reicht für die Service-Worker-Registrierung nicht aus (`SecurityError`), Zertifikat muss zusätzlich als vertrauenswürdige CA importiert werden — Anleitung für Linux-Desktop (NSS/`certutil`), Android und iOS ergänzt (s. „Push-Benachrichtigungen im Detail", App-Versionshistorie 0.6.1); veraltete Let's-Encrypt-Notiz für Mobil-Push-Testing entfernt |
| v4.22   | Push-Intervall konfigurierbar (neue `push_settings`-Tabelle, `GET`/`PUT /api/push/settings`, `PushSettingsCard`) — DB-Schema- und Endpoint-Tabellen sowie „Push-Benachrichtigungen im Detail" entsprechend ergänzt, veraltete `PUSH_INTERVAL_SECONDS`-Konstante aus der Doku entfernt (s. App-Versionshistorie 0.7.0) |
| v4.23   | „Pomodoro-Timer im Detail" präzisiert: Ton (Frequenz-Unterschied Arbeit/Pause) und Benachrichtigungen laufen rein clientseitig im offenen Tab, unabhängig von und zusätzlich zu den Web-Push-Benachrichtigungen (Doku, kein Code) |
