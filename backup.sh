#!/bin/bash
# BR-DMS Backup: PostgreSQL-Dump + Storage-Dateien
# Aufruf: ./backup.sh  (muss im selben Verzeichnis wie die .env liegen)
# Empfehlung: täglich per NAS-Aufgabenplaner (QNAP/Synology)
#
# Mit BACKUP_KEY in der .env werden beide Dateien verschlüsselt (AES-256, Schlüssel per PBKDF2):
# db_<Zeit>.sql.gz.enc und storage_<Zeit>.tar.gz.enc – ohne Klartext-Zwischendatei. So kann eine
# Kopie bei Dritten (z. B. der IT) liegen, ohne dass diese die Inhalte lesen können.
# BACKUP_KEY erzeugen: openssl rand -hex 32  → in die .env eintragen UND ausgedruckt wegschließen.
# Von Hand entschlüsseln (Notfall):
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass pass:<BACKUP_KEY> -in db_<Zeit>.sql.gz.enc | gunzip > db.sql

set -euo pipefail

# Im Aufgabenplaner (cron) fehlt docker oft im PATH – bekannte Orte auf QNAP und Synology ergänzen
PATH="$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin:/usr/local/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Fehler: $ENV_FILE nicht gefunden. backup.sh muss im DATA_PATH-Verzeichnis liegen." >&2
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
KEEP_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "[$(date)] BR-DMS Backup gestartet"

# Verschlüsseln von stdin nach stdout – openssl des Hosts, sonst das im Backend-Container
verschluesseln() {
  if command -v openssl >/dev/null 2>&1; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_KEY
  else
    docker exec -i -e BACKUP_KEY brdms_backend openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_KEY
  fi
}
if [ -n "$BACKUP_KEY" ]; then
  ENDUNG=".enc"
  echo "  → Verschlüsselt mit BACKUP_KEY"
else
  ENDUNG=""
  verschluesseln() { cat; }
  echo "  ⚠ WARNUNG: Kein BACKUP_KEY in der .env – Backup wird UNVERSCHLÜSSELT geschrieben."
  echo "    Die Datenbank enthält Protokolle, Personal- und Gehaltsdaten im Klartext."
  echo "    Abhilfe: openssl rand -hex 32  → als BACKUP_KEY=… in $ENV_FILE eintragen."
fi

# --- 1. PostgreSQL-Dump ---
echo "  → Datenbank-Dump..."
DB_USER=$(docker exec "$CONTAINER" printenv POSTGRES_USER)
DB_NAME=$(docker exec "$CONTAINER" printenv POSTGRES_DB)

docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" \
  --clean --if-exists \
  "$DB_NAME" \
  | gzip | verschluesseln > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz${ENDUNG}"

echo "     ✓ $BACKUP_DIR/db_${TIMESTAMP}.sql.gz${ENDUNG}"

# --- 2. Storage-Dateien ---
echo "  → Storage-Archiv..."
tar -czf - -C "$DATA_PATH" storage/ \
  | verschluesseln > "$BACKUP_DIR/storage_${TIMESTAMP}.tar.gz${ENDUNG}"

echo "     ✓ $BACKUP_DIR/storage_${TIMESTAMP}.tar.gz${ENDUNG}"

# --- 3. Rollierendes System: nur die letzten $KEEP Backups behalten ---
echo "  → Backups älter als ${KEEP_DAYS} Tage löschen..."
find "$BACKUP_DIR" \( -name "db_*.sql.gz" -o -name "db_*.sql.gz.enc" \) -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" \( -name "storage_*.tar.gz" -o -name "storage_*.tar.gz.enc" \) -mtime +$KEEP_DAYS -delete

echo "[$(date)] Backup abgeschlossen."
echo ""
echo "Vorhandene Backups:"
ls -lh "$BACKUP_DIR" | grep -v '^total'
