#!/bin/bash
# BR-DMS Backup: PostgreSQL-Dump + Storage-Dateien
# Aufruf: ./backup.sh
# Empfehlung: täglich per Synology Task Scheduler

set -euo pipefail

BACKUP_DIR="/volume1/docker/br-dms/backups"
DATA_PATH="/volume1/docker/br-dms"
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

# --- 3. Alte Backups aufräumen ---
echo "  → Backups älter als ${KEEP_DAYS} Tage löschen..."
find "$BACKUP_DIR" -name "db_*.sql.gz"      -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name "storage_*.tar.gz" -mtime +$KEEP_DAYS -delete

echo "[$(date)] Backup abgeschlossen."
echo ""
echo "Vorhandene Backups:"
ls -lh "$BACKUP_DIR" | grep -v '^total'
