#!/bin/bash
# Kopiert das Epoch-Projekt (ohne node_modules/.git, s. .gitignore) inkl. DB und
# .env auf einen anderen Server und passt dort den Bind-Mount-Pfad in der
# docker-compose.yml automatisch an den Zielpfad an.
#
# Aufruf: ./sync_to_server.sh <user@host> <remote_pfad>
# Beispiel: ./sync_to_server.sh bumblebeee@192.168.178.55 /home/bumblebeee/docker/epoch

set -e

TARGET_HOST="${1:?Usage: $0 <user@host> <remote_pfad>}"
REMOTE_PATH="${2:?Usage: $0 <user@host> <remote_pfad>}"
REMOTE_PATH="${REMOTE_PATH%/}"   # trailing slash entfernen, falls vorhanden

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Zielverzeichnis auf dem Server anlegen
ssh "$TARGET_HOST" "mkdir -p '$REMOTE_PATH'"

# Projekt kopieren (ohne node_modules, .git, data, .env — s. .gitignore)
rsync -avz --exclude-from="$SCRIPT_DIR/.gitignore" --exclude='.git' \
  "$SCRIPT_DIR/" "$TARGET_HOST:$REMOTE_PATH/"

# Datenbank kopieren
rsync -avz "$SCRIPT_DIR/data/" "$TARGET_HOST:$REMOTE_PATH/data/"

# Secrets kopieren (.env muss neben der docker-compose.yml liegen, damit
# docker compose die Variablen automatisch einliest)
scp "$SCRIPT_DIR/.env" "$TARGET_HOST:$REMOTE_PATH/.env"

# Bind-Mount-Pfad in der docker-compose.yml auf den Zielpfad umschreiben —
# sonst zeigt er weiter auf den Quell-Server und die App startet dort mit
# einer leeren DB (Docker legt fehlende Bind-Mount-Pfade automatisch neu an).
ssh "$TARGET_HOST" "sed -i -E 's|^(\s*-\s*)[^:]+(:/data)|\1$REMOTE_PATH/data\2|' '$REMOTE_PATH/docker-compose.yml'"

echo
echo "Fertig. Auf dem Zielserver noch ausführen:"
echo "  cd $REMOTE_PATH/frontend && npm install"
echo "  cd $REMOTE_PATH && docker compose up -d --build"
