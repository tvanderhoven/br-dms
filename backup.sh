#!/bin/bash
# BR-DMS Backup: PostgreSQL-Dump + Storage-Dateien
# Aufruf: ./backup.sh  (muss im selben Verzeichnis wie die .env liegen)
# Empfehlung: täglich per NAS-Aufgabenplaner (QNAP/Synology)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Fehler: $ENV_FILE nicht gefunden. backup.sh muss im DATA_PATH-Verzeichnis liegen." >&2
  exit 1
fi
set -a
source "$ENV_FILE"
set +a
DATA_PATH="${DATA_PATH:?DATA_PATH fehlt in $ENV_FILE}"

BACKUP_DIR="$DATA_PATH/backups"
CONTAINER="brdms_postgres"
KEEP_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "[$(date)] BR-DMS Backup gestartet"

# --- 1. PostgreSQL-Dump ---
echo "  → Datenbank-Dump..."
DB_USER=$(docker exec "$CONTAINER" printenv POSTGRES_USER)
DB_NAME=$(docker exec "$CONTAINER" printenv POSTGRES_DB)

docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" \
  --clean --if-exists \
  "$DB_NAME" \
  | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

echo "     ✓ $BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

# --- 2. Storage-Dateien ---
echo "  → Storage-Archiv..."
tar -czf "$BACKUP_DIR/storage_${TIMESTAMP}.tar.gz" \
  -C "$DATA_PATH" storage/

echo "     ✓ $BACKUP_DIR/storage_${TIMESTAMP}.tar.gz"

# --- 3. Rollierendes System: nur die letzten $KEEP Backups behalten ---
echo "  → Backups älter als ${KEEP_DAYS} Tage löschen..."
find "$BACKUP_DIR" -name "db_*.sql.gz"      -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name "storage_*.tar.gz" -mtime +$KEEP_DAYS -delete

echo "[$(date)] Backup abgeschlossen."
echo ""
echo "Vorhandene Backups:"
ls -lh "$BACKUP_DIR" | grep -v '^total'
