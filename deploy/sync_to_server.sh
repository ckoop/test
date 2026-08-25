#!/bin/bash
# Kopiert das Epoch-Projekt (ohne node_modules/.git, s. .gitignore) inkl. DB und
# .env auf einen anderen Server und passt dort den Bind-Mount-Pfad in der
# docker-compose.yml automatisch an den Zielpfad an.
#
# Aufruf: ./sync_to_server.sh <user@host> <remote_pfad>
# Beispiel: ./sync_to_server.sh user@host /pfad/zum/ziel
#
# SKIP_DATA=1 ./sync_to_server.sh <user@host> <remote_pfad>
#   Ueberspringt das Kopieren von data/ (SQLite-DB) — nutzen, wenn der
#   Zielserver eine eigene, unabhaengige Datenbank hat und nur der Code
#   aktualisiert werden soll (sonst wird die dortige DB ueberschrieben).
#
# HOST_PORT=8030 ./sync_to_server.sh <user@host> <remote_pfad>
#   Schreibt den extern erreichbaren Port um (Standard: 3000, wie lokal) —
#   noetig, wenn Port 3000 auf dem Zielserver schon belegt ist. Wird bei
#   jedem Sync neu gesetzt, geht also bei einem erneuten Sync ohne diese
#   Variable wieder auf 3000 zurueck.
#
# SSL_SAN="IP:1.2.3.4,DNS:localhost,IP:127.0.0.1" ./sync_to_server.sh <user@host> <remote_pfad>
#   Setzt SSL_SAN in der Ziel-.env explizit (fuer welche Hostnamen/IPs das
#   selbstsignierte TLS-Zertifikat des Zielservers gueltig sein soll, s.
#   frontend/docker-entrypoint.sh). Die .env wird bei jedem Sync komplett
#   durch die lokale Kopie ersetzt (scp) — ohne diese Variable wuerde dabei
#   ein bereits auf dem Zielserver gesetzter SSL_SAN-Wert durch den Wert
#   des Quell-Servers ueberschrieben werden. Darum: ohne diese Variable
#   bleibt ein bereits vorhandener SSL_SAN-Wert auf dem Zielserver erhalten
#   (wird nach dem Kopieren zurueckgeschrieben); ist auf dem Zielserver noch
#   keiner gesetzt (allererster Sync), bleibt der lokale Wert stehen und es
#   gibt eine Warnung, da er dann auf die falsche IP zeigen wird.

set -e

TARGET_HOST="${1:?Usage: $0 <user@host> <remote_pfad>}"
REMOTE_PATH="${2:?Usage: $0 <user@host> <remote_pfad>}"
REMOTE_PATH="${REMOTE_PATH%/}"   # trailing slash entfernen, falls vorhanden
HOST_PORT="${HOST_PORT:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Zielverzeichnis auf dem Server anlegen
ssh "$TARGET_HOST" "mkdir -p '$REMOTE_PATH'"

# Projekt kopieren (ohne node_modules, .git, data, .env, deploy/ — s. .gitignore)
rsync -avz --exclude-from="$PROJECT_DIR/.gitignore" --exclude='.git' --exclude='deploy/' \
  "$PROJECT_DIR/" "$TARGET_HOST:$REMOTE_PATH/"

# Datenbank kopieren (ueberspringbar via SKIP_DATA=1, s. Kopf des Skripts)
if [ "${SKIP_DATA:-0}" != "1" ]; then
  rsync -avz "$PROJECT_DIR/data/" "$TARGET_HOST:$REMOTE_PATH/data/"
else
  echo "SKIP_DATA=1 gesetzt — Datenbank wird NICHT synchronisiert (Zielserver behaelt seine eigenen Daten)."
fi

# Bisherigen SSL_SAN-Wert auf dem Zielserver sichern, BEVOR die .env
# gleich komplett durch die lokale Kopie ersetzt wird (s. SSL_SAN oben).
OLD_SSL_SAN="$(ssh "$TARGET_HOST" "grep '^SSL_SAN=' '$REMOTE_PATH/.env' 2>/dev/null | head -1" || true)"

# Secrets kopieren (.env muss neben der docker-compose.yml liegen, damit
# docker compose die Variablen automatisch einliest)
scp "$PROJECT_DIR/.env" "$TARGET_HOST:$REMOTE_PATH/.env"

# SSL_SAN in der Ziel-.env auf den serverspezifischen Wert setzen/erhalten
# (s. SSL_SAN oben) statt den gerade kopierten, falschen Quell-Server-Wert
# stehen zu lassen.
if [ -n "${SSL_SAN:-}" ]; then
  DESIRED_SSL_SAN="SSL_SAN=$SSL_SAN"
elif [ -n "$OLD_SSL_SAN" ]; then
  DESIRED_SSL_SAN="$OLD_SSL_SAN"
else
  DESIRED_SSL_SAN=""
fi

if [ -n "$DESIRED_SSL_SAN" ]; then
  ssh "$TARGET_HOST" "grep -q '^SSL_SAN=' '$REMOTE_PATH/.env' && sed -i \"s|^SSL_SAN=.*|$DESIRED_SSL_SAN|\" '$REMOTE_PATH/.env' || echo '$DESIRED_SSL_SAN' >> '$REMOTE_PATH/.env'"
  NEW_SSL_SAN_LINE="$(ssh "$TARGET_HOST" "grep '^SSL_SAN=' '$REMOTE_PATH/.env'" || true)"
  echo "SSL_SAN auf dem Zielserver jetzt: ${NEW_SSL_SAN_LINE:-<keine Zeile gefunden>}"
  case "$NEW_SSL_SAN_LINE" in
    "$DESIRED_SSL_SAN")
      echo "OK — SSL_SAN korrekt gesetzt."
      ;;
    *)
      echo "WARNUNG: SSL_SAN wurde NICHT wie erwartet gesetzt — bitte $REMOTE_PATH/.env auf dem Zielserver manuell pruefen."
      ;;
  esac
else
  echo "WARNUNG: Kein SSL_SAN fuer den Zielserver bekannt (weder per SSL_SAN=... uebergeben noch dort bereits vorhanden) — die kopierte .env enthaelt jetzt den Wert des Quell-Servers. Vor dem naechsten Container-Start SSL_SAN in $REMOTE_PATH/.env manuell auf die IP/den Hostnamen des Zielservers setzen, sonst ist das dort erzeugte TLS-Zertifikat fuer die falsche Adresse gueltig."
fi

# Bind-Mount-Pfad in der docker-compose.yml auf den Zielpfad umschreiben —
# sonst zeigt er weiter auf den Quell-Server und die App startet dort mit
# einer leeren DB (Docker legt fehlende Bind-Mount-Pfade automatisch neu an).
# [[:space:]] statt \s (GNU-Erweiterung) fuer maximale sed-Portabilitaet.
ssh "$TARGET_HOST" "sed -i -E 's|^([[:space:]]*-[[:space:]]*)[^:]+(:/data)|\1$REMOTE_PATH/data\2|' '$REMOTE_PATH/docker-compose.yml'"

# sed liefert bei 0 Treffern keinen Fehler (kein "set -e"-Abbruch) — darum
# hier aktiv verifizieren statt blind zu vertrauen.
NEW_LINE="$(ssh "$TARGET_HOST" "grep ':/data' '$REMOTE_PATH/docker-compose.yml'" || true)"
echo "Bind-Mount-Zeile auf dem Zielserver jetzt: ${NEW_LINE:-<keine Zeile mit :/data gefunden>}"
case "$NEW_LINE" in
  *"$REMOTE_PATH/data:/data"*)
    echo "OK — Pfad korrekt gesetzt."
    ;;
  *)
    echo "WARNUNG: Pfad wurde NICHT wie erwartet ersetzt — bitte $REMOTE_PATH/docker-compose.yml auf dem Zielserver manuell pruefen (evtl. abweichende sed-Version oder Datei-Format)."
    ;;
esac

# Extern erreichbaren Port umschreiben (Standard 3000, s. HOST_PORT oben).
ssh "$TARGET_HOST" "sed -i -E 's|^([[:space:]]*-[[:space:]]*\")[0-9]+(:80\")|\1$HOST_PORT\2|' '$REMOTE_PATH/docker-compose.yml'"

NEW_PORT_LINE="$(ssh "$TARGET_HOST" "grep ':80\"' '$REMOTE_PATH/docker-compose.yml'" || true)"
echo "Port-Zeile auf dem Zielserver jetzt: ${NEW_PORT_LINE:-<keine Zeile mit :80 gefunden>}"
case "$NEW_PORT_LINE" in
  *"\"$HOST_PORT:80\""*)
    echo "OK — Port korrekt auf $HOST_PORT gesetzt."
    ;;
  *)
    echo "WARNUNG: Port wurde NICHT wie erwartet auf $HOST_PORT gesetzt — bitte $REMOTE_PATH/docker-compose.yml auf dem Zielserver manuell pruefen."
    ;;
esac

echo
echo "Baue und starte Container auf dem Zielserver neu..."
ssh "$TARGET_HOST" "cd '$REMOTE_PATH' && docker compose up -d --build"
echo "Fertig — Container auf dem Zielserver laufen mit dem neuen Stand."
