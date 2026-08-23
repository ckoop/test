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

# Secrets kopieren (.env muss neben der docker-compose.yml liegen, damit
# docker compose die Variablen automatisch einliest)
scp "$PROJECT_DIR/.env" "$TARGET_HOST:$REMOTE_PATH/.env"

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
