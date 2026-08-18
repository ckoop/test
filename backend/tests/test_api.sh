#!/bin/bash
# Epoch API smoke tests — curl-basiert, deckt die wichtigsten Endpunkte ab.
#
# Voraussetzung: Container laufen (docker compose up -d), erreichbar über BASE_URL.
# Legt eigene Test-Projekte/-Einträge an und räumt sie am Ende wieder auf —
# rührt die bestehenden Produktivdaten nicht an.
#
# Aufruf: ./test_api.sh   (oder: BASE_URL=http://localhost:3000/api ./test_api.sh)

set -u
BASE_URL="${BASE_URL:-http://localhost:3000/api}"

PASS=0
FAIL=0

# ── Helpers ───────────────────────────────────────────────────────────────────

# curl_json METHOD PATH [BODY] -> setzt $BODY_OUT (Response-Body) und $STATUS (HTTP-Code)
curl_json() {
  local method="$1" path="$2" data="${3:-}"
  local resp
  if [ -n "$data" ]; then
    resp=$(curl -sS -o /tmp/epoch_test_body.$$ -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" -d "$data" "$BASE_URL$path")
  else
    resp=$(curl -sS -o /tmp/epoch_test_body.$$ -w "%{http_code}" -X "$method" "$BASE_URL$path")
  fi
  STATUS="$resp"
  BODY_OUT=$(cat /tmp/epoch_test_body.$$)
  rm -f /tmp/epoch_test_body.$$
}

check() {
  local desc="$1" cond="$2"
  if [ "$cond" = "0" ]; then
    echo "  OK   $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL $desc"
    echo "       STATUS=$STATUS BODY=$BODY_OUT"
    FAIL=$((FAIL+1))
  fi
}

expect_status() {
  local desc="$1" expected="$2"
  [ "$STATUS" = "$expected" ]
  check "$desc (HTTP $expected)" "$?"
}

expect_jq() {
  local desc="$1" filter="$2" expected="$3"
  local actual
  actual=$(echo "$BODY_OUT" | jq -r "$filter" 2>/dev/null)
  [ "$actual" = "$expected" ]
  check "$desc ($filter == $expected, war '$actual')" "$?"
}

# ── 0. Health ─────────────────────────────────────────────────────────────────

echo "== Health =="
curl_json GET /health
expect_status "Health-Check erreichbar" 200
expect_jq "Health-Status ok" '.status' "ok"

# ── 1. Projekte ───────────────────────────────────────────────────────────────

echo "== Projekte =="
TEST_PROJECT="_TestProjekt_$$"

curl_json POST /projects "{\"name\":\"$TEST_PROJECT\",\"color\":\"#123456\"}"
expect_status "Projekt anlegen" 200
PROJECT_ID=$(echo "$BODY_OUT" | jq -r '.id')
expect_jq "Projektname korrekt" '.name' "$TEST_PROJECT"

curl_json GET /projects
expect_status "Projektliste abrufen" 200
echo "$BODY_OUT" | jq -e ".[] | select(.name == \"$TEST_PROJECT\")" >/dev/null 2>&1
check "Neues Projekt in Liste sichtbar" "$?"

curl_json POST /projects "{\"name\":\"$TEST_PROJECT\",\"color\":\"#123456\"}"
expect_status "Doppelter Projektname wird abgelehnt" 400

curl_json PUT "/projects/$PROJECT_ID" '{"color":"#abcdef"}'
expect_status "Projekt aktualisieren" 200
expect_jq "Projektfarbe aktualisiert" '.color' "#abcdef"

# ── 2. Timer ──────────────────────────────────────────────────────────────────

echo "== Timer =="

curl_json GET /timer/active
expect_status "Aktiven Timer abfragen (vor Start)" 200
PRE_EXISTING_TIMER=$(echo "$BODY_OUT" | jq -r 'if . == null then "none" else .id end')

if [ "$PRE_EXISTING_TIMER" != "none" ]; then
  echo "  SKIP Timer-Tests uebersprungen: es laeuft bereits ein Timer (id=$PRE_EXISTING_TIMER)"
else
  curl_json POST /timer/start "{\"project\":\"$TEST_PROJECT\",\"description\":\"Testlauf\"}"
  expect_status "Timer starten" 200
  TIMER_ID=$(echo "$BODY_OUT" | jq -r '.id')
  expect_jq "Timer laeuft (kein end_time)" '.end_time' "null"

  curl_json POST /timer/start "{\"project\":\"$TEST_PROJECT\"}"
  expect_status "Zweiter Timer-Start wird abgelehnt, solange einer laeuft" 400

  curl_json POST /timer/pause
  expect_status "Timer pausieren" 200
  echo "$BODY_OUT" | jq -e '.paused_at != null' >/dev/null 2>&1
  check "paused_at gesetzt" "$?"

  curl_json POST /timer/pause
  expect_status "Erneutes Pausieren wird abgelehnt" 400

  curl_json POST /timer/resume
  expect_status "Timer fortsetzen" 200
  expect_jq "paused_at wieder null" '.paused_at' "null"

  curl_json POST /timer/active
  # /timer/active ist GET, obiger Aufruf nur zur Konsistenzpruefung nicht noetig
  curl_json GET /timer/active
  expect_status "Aktiver Timer sichtbar" 200
  expect_jq "Aktiver Timer hat erwartete ID" '.id' "$TIMER_ID"

  curl_json POST /timer/stop
  expect_status "Timer stoppen" 200
  echo "$BODY_OUT" | jq -e '.end_time != null and .duration_minutes != null' >/dev/null 2>&1
  check "Timer nach Stop hat end_time + duration_minutes" "$?"

  curl_json POST /timer/stop
  expect_status "Erneutes Stoppen ohne aktiven Timer schlaegt fehl" 404
fi

# ── 3. Manuelle Eintraege ────────────────────────────────────────────────────

echo "== Manuelle Eintraege =="
TODAY=$(date +%F)

curl_json POST /entries/manual "{\"date\":\"$TODAY\",\"start_time\":\"09:00\",\"end_time\":\"10:30\",\"project\":\"$TEST_PROJECT\",\"description\":\"Testeintrag\"}"
expect_status "Manuellen Eintrag anlegen" 200
ENTRY_ID=$(echo "$BODY_OUT" | jq -r '.id')
expect_jq "Dauer korrekt berechnet (90 Min)" '.duration_minutes' "90.0"

curl_json POST /entries/manual "{\"date\":\"$TODAY\",\"start_time\":\"11:00\",\"end_time\":\"10:00\",\"project\":\"$TEST_PROJECT\",\"description\":\"Ungueltig\"}"
expect_status "Endzeit vor Startzeit wird abgelehnt" 400

curl_json PUT "/entries/$ENTRY_ID" '{"description":"Testeintrag geaendert"}'
expect_status "Eintrag aktualisieren" 200
expect_jq "Beschreibung geaendert" '.description' "Testeintrag geaendert"

curl_json GET "/entries?from_date=$TODAY&to_date=$TODAY"
expect_status "Eintraege des Tages abrufen" 200
echo "$BODY_OUT" | jq -e ".[] | select(.id == $ENTRY_ID)" >/dev/null 2>&1
check "Neuer Eintrag in Tagesliste sichtbar" "$?"

# ── 4. Tag / Woche / Notiz ───────────────────────────────────────────────────

echo "== Tag / Woche / Notiz =="

curl_json GET "/day/$TODAY"
expect_status "Tageszusammenfassung abrufen" 200
echo "$BODY_OUT" | jq -e ".entries[] | select(.id == $ENTRY_ID)" >/dev/null 2>&1
check "Testeintrag in Tageszusammenfassung enthalten" "$?"

curl_json PUT "/notes/$TODAY" '{"note":"Testnotiz","mood":4}'
expect_status "Tagesnotiz speichern" 200
expect_jq "Notiztext korrekt" '.note' "Testnotiz"

curl_json GET /week
expect_status "Wochenuebersicht abrufen" 200
echo "$BODY_OUT" | jq -e 'length == 7' >/dev/null 2>&1
check "Woche hat 7 Tage" "$?"

# ── 5. Stats / Export ─────────────────────────────────────────────────────────

echo "== Stats / Export =="
YEAR=$(date +%Y); MONTH=$(date +%-m)

curl_json GET "/stats/monthly?year=$YEAR&month=$MONTH"
expect_status "Monatsstatistik abrufen" 200
echo "$BODY_OUT" | jq -e ".by_project | has(\"$TEST_PROJECT\")" >/dev/null 2>&1
check "Testprojekt taucht in Monatsstatistik auf" "$?"

CSV_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/export/csv?from_date=$TODAY&to_date=$TODAY")
[ "$CSV_STATUS" = "200" ]
check "CSV-Export liefert HTTP 200" "$?"

JSON_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/export/json?from_date=$TODAY&to_date=$TODAY")
[ "$JSON_STATUS" = "200" ]
check "JSON-Export liefert HTTP 200" "$?"

# ── 6. Pomodoro ───────────────────────────────────────────────────────────────

echo "== Pomodoro =="

curl_json GET /pomodoro/settings
expect_status "Pomodoro-Einstellungen abrufen" 200

curl_json GET /pomodoro/active
expect_status "Aktiven Pomodoro-Status abfragen" 200
PRE_EXISTING_POMODORO=$(echo "$BODY_OUT" | jq -r '.phase')

if [ "$PRE_EXISTING_POMODORO" != "null" ]; then
  echo "  SKIP Pomodoro-Tests uebersprungen: es laeuft bereits eine Session (phase=$PRE_EXISTING_POMODORO)"
elif [ "$PRE_EXISTING_TIMER" != "none" ]; then
  echo "  SKIP Pomodoro-Tests uebersprungen: es laeuft noch ein normaler Timer"
else
  curl_json POST /pomodoro/start "{\"project\":\"$TEST_PROJECT\"}"
  expect_status "Pomodoro starten" 200
  expect_jq "Phase ist 'work'" '.phase' "work"

  curl_json POST /pomodoro/start "{\"project\":\"$TEST_PROJECT\"}"
  expect_status "Zweiter Pomodoro-Start wird abgelehnt" 400

  curl_json POST /pomodoro/skip
  expect_status "Pomodoro-Phase ueberspringen" 200

  curl_json POST /pomodoro/stop
  expect_status "Pomodoro stoppen" 200
  expect_jq "Phase nach Stop ist null" '.phase' "null"
fi

# ── 7. Mail-Konfiguration (nur Lesezugriff, kein Versand) ───────────────────

echo "== Mail-Konfiguration =="
curl_json GET /mail/config
expect_status "Mail-Konfiguration abrufen" 200

curl_json GET /mail/log
expect_status "Mail-Log abrufen" 200

# ── 8. Admin-Reset (nur Ablehnungs-Pfad — echter Reset wuerde Produktivdaten loeschen) ──

echo "== Admin-Reset (Negativtest) =="

curl_json POST /admin/reset '{"confirm":"falsch"}'
expect_status "Reset ohne korrekte Bestaetigung wird abgelehnt" 400

# ── Cleanup ───────────────────────────────────────────────────────────────────

echo "== Cleanup =="

# Timer- und Pomodoro-Tests legen ebenfalls Eintraege auf dem Testprojekt an —
# alle heutigen Eintraege des Testprojekts einsammeln und loeschen, sonst
# blockt die Verwendungs-Sperre das Loeschen des Projekts (siehe Test oben).
curl_json GET "/entries?from_date=$TODAY&to_date=$TODAY"
for id in $(echo "$BODY_OUT" | jq -r ".[] | select(.project == \"$TEST_PROJECT\") | .id"); do
  curl_json DELETE "/entries/$id"
  expect_status "Testeintrag $id loeschen" 200
done

curl_json PUT "/projects/$PROJECT_ID" '{"active":0}'
expect_status "Testprojekt archivieren (vor Loeschen noetig)" 200

curl_json DELETE "/projects/$PROJECT_ID"
expect_status "Testprojekt loeschen" 200

# ── Zusammenfassung ───────────────────────────────────────────────────────────

echo
echo "════════════════════════════════════"
echo "  Bestanden: $PASS   Fehlgeschlagen: $FAIL"
echo "════════════════════════════════════"

[ "$FAIL" -eq 0 ]
