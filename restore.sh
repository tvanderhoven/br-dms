#!/bin/bash
# BR-DMS Restore: Backup wieder einspielen
# Aufruf: ./restore.sh  (muss im selben Verzeichnis wie die .env liegen)
# Wählt interaktiv aus vorhandenen Backups
#
# WICHTIG: Der ENCRYPTION_KEY in der .env dieses Systems muss vor dem Restore
# bereits der gleiche sein wie im System, von dem das Backup stammt - sonst
# lassen sich die wiederhergestellten Dokumente nicht mehr entschlüsseln.

set -euo pipefail

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

BACKUP_DIR="$DATA_PATH/backups"
CONTAINER="brdms_postgres"

# --- Verfügbare DB-Backups anzeigen ---
echo ""
echo "=== BR-DMS Restore ==="
echo ""
echo "Verfügbare Datenbank-Backups:"
DB_BACKUPS=()
i=1
while IFS= read -r -d '' f; do
  DB_BACKUPS+=("$f")
  SIZE=$(du -h "$f" | cut -f1)
  MTIME=$(date -r "$f" '+%Y-%m-%d %H:%M')
  echo "  [$i] $(basename "$f")  ($SIZE, $MTIME)"
  ((i++))
done < <(find "$BACKUP_DIR" -name "db_*.sql.gz" -print0 | sort -z)

if [ ${#DB_BACKUPS[@]} -eq 0 ]; then
  echo "  Keine DB-Backups gefunden in $BACKUP_DIR"
  exit 1
fi

echo ""
read -rp "DB-Backup auswählen (Nummer): " DB_CHOICE
DB_FILE="${DB_BACKUPS[$((DB_CHOICE-1))]}"

# --- Passenden Storage-Backup suchen ---
TIMESTAMP=$(basename "$DB_FILE" | sed 's/db_//' | sed 's/\.sql\.gz//')
STORAGE_FILE="$BACKUP_DIR/storage_${TIMESTAMP}.tar.gz"

echo ""
if [ -f "$STORAGE_FILE" ]; then
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
read -rp "Fortfahren? (ja/N): " CONFIRM
[ "$CONFIRM" != "ja" ] && echo "Abgebrochen." && exit 0

# --- Backend stoppen (Postgres läuft weiter) ---
echo ""
echo "[$(date)] Backend stoppen..."
docker stop brdms_backend 2>/dev/null || true

# --- DB einspielen ---
echo "[$(date)] Datenbank wiederherstellen..."
DB_USER=$(docker exec "$CONTAINER" printenv POSTGRES_USER)
DB_NAME=$(docker exec "$CONTAINER" printenv POSTGRES_DB)

gunzip -c "$DB_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q

echo "  ✓ Datenbank eingespielt"

# --- Storage einspielen ---
if [ "${RESTORE_STORAGE,,}" = "j" ]; then
  echo "[$(date)] Storage wiederherstellen..."
  rm -rf "$DATA_PATH/storage"
  tar -xzf "$STORAGE_FILE" -C "$DATA_PATH"
  echo "  ✓ Storage eingespielt"
fi

# --- Backend neu starten ---
echo "[$(date)] Backend neu starten..."
docker start brdms_backend

echo ""
echo "[$(date)] Restore abgeschlossen."
echo "  Bitte prüfe das System unter der konfigurierten APP_URL (siehe .env)."
