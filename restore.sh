#!/bin/bash
# BR-DMS Restore: Backup wieder einspielen
# Aufruf: ./restore.sh
# Wählt interaktiv aus vorhandenen Backups

set -euo pipefail

BACKUP_DIR="/share/Container/br-dms/backups"
DATA_PATH="/share/Container/br-dms"
CONTAINER="brdms_postgres"
COMPOSE_DIR="/share/Container/br-dms"

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
cd "$COMPOSE_DIR"
docker start brdms_backend

echo ""
echo "[$(date)] Restore abgeschlossen."
echo "  Bitte prüfe das System unter http://<NAS-IP>:3000"
