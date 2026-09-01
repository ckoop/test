#!/bin/sh
# Erzeugt beim allerersten Start ein selbstsigniertes TLS-Zertifikat (falls im
# Bind-Mount ./data/certs noch keins liegt) und startet danach Nginx.
#
# SSL_SAN steuert, für welche Hostnamen/IPs das Zertifikat gültig ist —
# per docker-compose.yml/.env setzen (z.B. "IP:192.168.178.55,DNS:localhost,IP:127.0.0.1").
# Ohne HTTPS gilt der Aufruf für den Browser nicht als Secure Context, wodurch
# u.a. die Picture-in-Picture-API (s. FloatingWidget.jsx) nicht verfügbar ist.
set -e

CERT_DIR=/etc/nginx/certs
CERT_FILE="$CERT_DIR/fullchain.pem"
KEY_FILE="$CERT_DIR/privkey.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  mkdir -p "$CERT_DIR"
  SAN="${SSL_SAN:-DNS:localhost,IP:127.0.0.1}"
  echo "Kein Zertifikat gefunden — erzeuge selbstsigniertes Zertifikat (SAN: $SAN) ..."
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -days 3650 \
    -subj "/CN=epoch.local" \
    -addext "subjectAltName=$SAN"
  echo "Zertifikat erzeugt, gültig bis $(date -d '+3650 days' '+%Y-%m-%d' 2>/dev/null || echo '(in 10 Jahren)')."
fi

exec nginx -g "daemon off;"
