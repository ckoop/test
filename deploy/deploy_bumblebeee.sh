#!/bin/bash
# Deployt Epoch auf den zweiten Server (bumblebeee@192.168.178.55).
# Nutzt Port 8030 statt 3000 (dort belegt) und ueberspringt den DB-Sync,
# damit die eigenstaendigen Zeiteintraege auf dem Zielserver erhalten bleiben.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HOST_PORT=8030 SKIP_DATA=1 SSL_SAN="IP:192.168.178.55,DNS:localhost,IP:127.0.0.1" \
  "$SCRIPT_DIR/sync_to_server.sh" bumblebeee@192.168.178.55 /home/bumblebeee/docker/claude
