#!/bin/bash
# BR-DMS Restore: Backup wieder einspielen
# Aufruf: ./restore.sh  (muss im selben Verzeichnis wie die .env liegen)
# Wählt interaktiv aus vorhandenen Backups
#
# Ohne Rückfragen (z. B. aus demo_modus.sh):
#   ./restore.sh <pfad/db_<Zeit>.sql.gz[.enc]> [--mit-storage] [--ja]
#   Das Storage-Backup wird neben der DB-Datei gesucht (gleicher Zeitstempel).
#
# WICHTIG: Der ENCRYPTION_KEY in der .env dieses Systems muss vor dem Restore
# bereits der gleiche sein wie im System, von dem das Backup stammt - sonst
# lassen sich die wiederhergestellten Dokumente nicht mehr entschlüsseln.
# Verschlüsselte Backups (*.enc) brauchen zusätzlich den BACKUP_KEY des Quellsystems in der .env.

set -euo pipefail

# Im Aufgabenplaner (cron) fehlt docker oft im PATH – bekannte Orte auf QNAP und Synology ergänzen
PATH="$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin:/usr/local/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Fehler: $ENV_FILE nicht gefunden. restore.sh muss im DATA_PATH-Verzeichnis liegen." >&2
  exit 1
fi
# Nur DATA_PATH gezielt auslesen statt die .env zu sourcen - Werte wie
# SMTP_FROM="BR-DMS <...>" enthalten Shell-Sonderzeichen (< >), die beim
# Sourcen zu Syntaxfehlern fuehren.
DATA_PATH="$(grep -E '^DATA_PATH=' "$ENV_FILE" | tail -1 | cut -d'=' -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
DATA_PATH="${DATA_PATH:?DATA_PATH fehlt oder ist leer in $ENV_FILE}"
# Optional – "|| true", sonst bricht set -o pipefail ab, wenn der Eintrag fehlt
BACKUP_KEY="$({ grep -E '^BACKUP_KEY=' "$ENV_FILE" || true; } | tail -1 | cut -d'=' -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
export BACKUP_KEY

BACKUP_DIR="$DATA_PATH/backups"
CONTAINER="brdms_postgres"

# --- Parameter (optional) ---
ARG_DATEI=""; ARG_STORAGE=""; ARG_JA=""
for arg in "$@"; do
  case "$arg" in
    --mit-storage) ARG_STORAGE="j" ;;
    --ja)          ARG_JA="ja" ;;
    -*)            echo "Unbekannte Option: $arg" >&2; exit 1 ;;
    *)             ARG_DATEI="$arg" ;;
  esac
done

echo ""
echo "=== BR-DMS Restore ==="
echo ""
if [ -n "$ARG_DATEI" ]; then
  [ -f "$ARG_DATEI" ] || { echo "Fehler: $ARG_DATEI nicht gefunden." >&2; exit 1; }
  DB_FILE="$ARG_DATEI"
else
# --- Verfügbare DB-Backups anzeigen ---
echo "Verfügbare Datenbank-Backups:"
DB_BACKUPS=()
i=1
while IFS= read -r -d '' f; do
  DB_BACKUPS+=("$f")
  SIZE=$(du -h "$f" | cut -f1)
  MTIME=$(date -r "$f" '+%Y-%m-%d %H:%M')
  echo "  [$i] $(basename "$f")  ($SIZE, $MTIME)"
  ((i++))
done < <(find "$BACKUP_DIR" \( -name "db_*.sql.gz" -o -name "db_*.sql.gz.enc" \) -print0 | sort -z)

if [ ${#DB_BACKUPS[@]} -eq 0 ]; then
  echo "  Keine DB-Backups gefunden in $BACKUP_DIR"
  exit 1
fi

echo ""
read -rp "DB-Backup auswählen (Nummer): " DB_CHOICE
DB_FILE="${DB_BACKUPS[$((DB_CHOICE-1))]}"
fi

# --- Verschlüsselt? Dann wird der BACKUP_KEY gebraucht ---
ENDUNG=""
case "$DB_FILE" in *.enc) ENDUNG=".enc" ;; esac
if [ -n "$ENDUNG" ] && [ -z "$BACKUP_KEY" ]; then
  echo "Fehler: Das Backup ist verschlüsselt, aber in $ENV_FILE steht kein BACKUP_KEY." >&2
  echo "        Den BACKUP_KEY des Quellsystems eintragen (Ausdruck) und erneut starten." >&2
  exit 1
fi

# --- Passenden Storage-Backup suchen ---
TIMESTAMP=$(basename "$DB_FILE" | sed 's/db_//' | sed 's/\.sql\.gz.*//')
STORAGE_FILE="$(dirname "$DB_FILE")/storage_${TIMESTAMP}.tar.gz${ENDUNG}"

echo ""
if [ -f "$STORAGE_FILE" ] && [ -n "$ARG_STORAGE" ]; then
  RESTORE_STORAGE="j"
elif [ -f "$STORAGE_FILE" ]; then
  read -rp "Zugehöriges Storage-Backup auch einspielen? (j/N): " RESTORE_STORAGE
else
  echo "Kein passendes Storage-Backup gefunden (nur DB wird eingespielt)."
  RESTORE_STORAGE="n"
fi

# --- Bestätigung ---
echo ""
echo "Folgendes wird wiederhergestellt:"
echo "  DB:      $(basename "$DB_FILE")"
[ "${RESTORE_STORAGE,,}" = "j" ] && echo "  Storage: $(basename "$STORAGE_FILE")"
echo ""
echo "ACHTUNG: Die aktuelle Datenbank wird dabei ÜBERSCHRIEBEN."
if [ -n "$ARG_JA" ]; then CONFIRM="ja"; else read -rp "Fortfahren? (ja/N): " CONFIRM; fi
[ "$CONFIRM" != "ja" ] && echo "Abgebrochen." && exit 0

# --- Entschlüsseln ---
# Mit openssl auf dem Host direkt im Datenstrom. Sonst über den Backend-Container – der wird gleich
# gestoppt, deshalb dann vorher in temporäre Dateien entschlüsseln (werden am Ende gelöscht).
TMP_DIR=""
aufraeumen() { if [ -n "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi; }
trap aufraeumen EXIT
entschluesseln() {
  if [ -z "$ENDUNG" ]; then cat "$1"
  elif command -v openssl >/dev/null 2>&1; then
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_KEY -in "$1"
  else
    docker exec -i -e BACKUP_KEY brdms_backend openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_KEY < "$1"
  fi
}
DB_QUELLE="$DB_FILE"; STORAGE_QUELLE="$STORAGE_FILE"
if [ -n "$ENDUNG" ]; then
  echo ""
  echo "[$(date)] Schlüssel prüfen..."
  if ! entschluesseln "$DB_FILE" 2>/dev/null | gunzip -t 2>/dev/null; then
    echo "Fehler: Entschlüsseln fehlgeschlagen – falscher BACKUP_KEY oder beschädigte Datei." >&2
    exit 1
  fi
  echo "  ✓ BACKUP_KEY passt"
  if ! command -v openssl >/dev/null 2>&1; then
    TMP_DIR="$(mktemp -d "$BACKUP_DIR/.restore_XXXXXX")"
    chmod 700 "$TMP_DIR"
    entschluesseln "$DB_FILE" > "$TMP_DIR/db.sql.gz"; DB_QUELLE="$TMP_DIR/db.sql.gz"
    if [ "${RESTORE_STORAGE,,}" = "j" ]; then
      entschluesseln "$STORAGE_FILE" > "$TMP_DIR/storage.tar.gz"; STORAGE_QUELLE="$TMP_DIR/storage.tar.gz"
    fi
    ENDUNG=""   # ab hier unverschlüsselte Zwischendateien
  fi
fi

# --- Backend stoppen (Postgres läuft weiter) ---
echo ""
echo "[$(date)] Backend stoppen..."
docker stop brdms_backend 2>/dev/null || true

# --- DB einspielen ---
echo "[$(date)] Datenbank wiederherstellen..."
DB_USER=$(docker exec "$CONTAINER" printenv POSTGRES_USER)
DB_NAME=$(docker exec "$CONTAINER" printenv POSTGRES_DB)

# In einem Schritt und beim ersten Fehler abbrechen – sonst bliebe bei einem Fehler
# eine halb eingespielte Datenbank zurück (ohne Fehler: unverändertes Ergebnis)
if ! entschluesseln "$DB_QUELLE" | gunzip -c \
     | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 --single-transaction; then
  echo "Fehler: Die Datenbank konnte nicht eingespielt werden – sie ist unverändert (Stand vor dem Restore)." >&2
  echo "        Backend wird wieder gestartet. Meldung oben prüfen." >&2
  docker start brdms_backend >/dev/null 2>&1 || true
  exit 1
fi

echo "  ✓ Datenbank eingespielt"

# --- Storage einspielen ---
if [ "${RESTORE_STORAGE,,}" = "j" ]; then
  echo "[$(date)] Storage wiederherstellen..."
  rm -rf "$DATA_PATH/storage"
  entschluesseln "$STORAGE_QUELLE" | tar -xzf - -C "$DATA_PATH"
  echo "  ✓ Storage eingespielt"
fi

# --- Backend neu starten ---
echo "[$(date)] Backend neu starten..."
docker start brdms_backend

echo ""
echo "[$(date)] Restore abgeschlossen."
echo "  Bitte prüfe das System unter der konfigurierten APP_URL (siehe .env)."
