#!/bin/bash
set -e

# Zielverzeichnis auf dem Server anlegen
ssh bumblebeee@192.168.178.55 "mkdir -p /home/bumblebeee/docker/epoch/"

# Projekt kopieren (ohne node_modules, .git, data, .env)
rsync -avz --exclude-from='.gitignore' --exclude='.git' \
  /home/christian/claude/ bumblebeee@192.168.178.55:/home/bumblebeee/docker/epoch/

# Datenbank kopieren
rsync -avz /home/christian/claude/data/ bumblebeee@192.168.178.55:/home/bumblebeee/docker/epoch/data/

# Secrets kopieren
scp /home/christian/claude/.env bumblebeee@192.168.178.55:/home/bumblebeee/docker/epoch.env
