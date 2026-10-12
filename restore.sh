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
#
# Versionsprüfung: backup.sh legt info_<Zeit>.txt mit Version und Commit daneben. Stammt das Backup
# von einer NEUEREN Version als dieses System, bricht restore.sh ab (erst das System aktualisieren;
# erzwingen mit --trotzdem). Ältere Backups werden eingespielt; das Backend ergänzt beim Start die
# seither hinzugekommenen Tabellen und Felder.

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

# Version, Commit und Schema-Prüfsumme des laufenden Systems – gleicher Block wie in backup.sh
stand_ermitteln() {
  # docker exec schreibt eigene Fehler auf stdout – deshalb Ausgabe nur bei Erfolg übernehmen
  STAND_VERSION="$(docker exec brdms_backend node -p "require('/app/package.json').version" 2>/dev/null)" || STAND_VERSION=""
  [ -n "$STAND_VERSION" ] || STAND_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DATA_PATH/backend/package.json" 2>/dev/null | head -1 || true)"
  STAND_SCHEMA="$(docker exec brdms_backend sha256sum /app/prisma/schema.prisma 2>/dev/null)" \
    || STAND_SCHEMA="$(sha256sum "$DATA_PATH/backend/prisma/schema.prisma" 2>/dev/null)" || STAND_SCHEMA=""
  STAND_SCHEMA="${STAND_SCHEMA:0:12}"
  STAND_COMMIT="$(sed -n 's/.*"commit": *"\([^"]*\)".*/\1/p' "$DATA_PATH/frontend/src/buildinfo.json" 2>/dev/null || true)"
}
# Ein Wert aus info_<Zeit>.txt (leer, wenn Datei oder Eintrag fehlt)
info_wert() { { grep -E "^$2=" "$1" 2>/dev/null || true; } | tail -1 | cut -d'=' -f2- | tr -d '\r'; }
# Infodatei zu einer DB-Datei: gleicher Ordner, gleicher Zeitstempel
info_datei() { echo "$(dirname "$1")/info_$(basename "$1" | sed -e 's/^db_//' -e 's/\.sql\.gz.*//').txt"; }

BACKUP_DIR="$DATA_PATH/backups"
CONTAINER="brdms_postgres"

# --- Parameter (optional) ---
ARG_DATEI=""; ARG_STORAGE=""; ARG_JA=""; ARG_TROTZDEM=""
for arg in "$@"; do
  case "$arg" in
    --mit-storage) ARG_STORAGE="j" ;;
    --ja)          ARG_JA="ja" ;;
    --trotzdem)    ARG_TROTZDEM="ja" ;;
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
  VER="$(info_wert "$(info_datei "$f")" version)"
  echo "  [$i] $(basename "$f")  ($SIZE, $MTIME, Version ${VER:-unbekannt})"
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

# --- Versionsprüfung: Backup-Stand gegen laufendes System ---
stand_ermitteln
INFO_FILE="$(info_datei "$DB_FILE")"
B_VERSION="$(info_wert "$INFO_FILE" version)"
B_COMMIT="$(info_wert "$INFO_FILE" commit)"
B_SCHEMA="$(info_wert "$INFO_FILE" schema)"
BACKUP_AELTER=""
echo ""
echo "Version des Backups: ${B_VERSION:-unbekannt}${B_COMMIT:+ · $B_COMMIT}"
echo "Version des Systems: ${STAND_VERSION:-unbekannt}${STAND_COMMIT:+ · $STAND_COMMIT}"
if [ -z "$B_VERSION" ] || [ -z "$STAND_VERSION" ]; then
  echo "  ⚠ Version nicht vergleichbar (Backup von vor BR-DMS 1.3.1 oder Infodatei fehlt) – wird trotzdem versucht."
  BACKUP_AELTER="vielleicht"
elif [ -n "$B_SCHEMA" ] && [ "$B_SCHEMA" = "$STAND_SCHEMA" ]; then
  echo "  ✓ Gleiche Datenbankstruktur"
elif [ "$B_VERSION" != "$STAND_VERSION" ] && [ "$(printf '%s\n%s\n' "$B_VERSION" "$STAND_VERSION" | sort -V | tail -1)" = "$B_VERSION" ]; then
  echo ""
  echo "  ✗ Das Backup stammt von einer NEUEREN Version ($B_VERSION) als dieses System ($STAND_VERSION)."
  echo "    Das ältere Backend kennt die neueren Tabellen und Felder nicht und würde danach nicht starten."
  echo "    Erst das System auf mindestens $B_VERSION aktualisieren (deploy_update.sh --bauen), dann einspielen."
  if [ -z "$ARG_TROTZDEM" ]; then
    echo "    (Erzwingen auf eigene Gefahr: restore.sh <db-Datei> --trotzdem)"
    exit 1
  fi
  echo "    --trotzdem angegeben – es wird dennoch eingespielt."
else
  echo "  ⚠ Das Backup stammt von einem älteren Stand. Die Datenbank wird komplett ersetzt; das Backend"
  echo "    ergänzt beim Start die seither hinzugekommenen Tabellen und Felder (Daten daraus sind dann leer)."
  BACKUP_AELTER="ja"
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

# Vorher das Schema leeren: Tabellen, die es nur im aktuellen (neueren) System gibt, würden sonst
# stehen bleiben und mit ihren Fremdschlüsseln das Löschen der alten Tabellen blockieren – ein
# älteres Backup ließe sich dann nicht einspielen. Rechte wie beim Anlegen der Datenbank.
# In einem Schritt und beim ersten Fehler abbrechen – sonst bliebe bei einem Fehler
# eine halb eingespielte Datenbank zurück (ohne Fehler: unverändertes Ergebnis)
if ! { echo "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION pg_database_owner; GRANT USAGE ON SCHEMA public TO PUBLIC;"
       entschluesseln "$DB_QUELLE" | gunzip -c; } \
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
START_ZEIT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker start brdms_backend

# Beim Start gleicht das Backend die Datenbankstruktur an – bei älteren Backups abwarten, ob das klappt
if [ -n "$BACKUP_AELTER" ]; then
  echo "[$(date)] Warte auf den Abgleich der Datenbankstruktur..."
  ERGEBNIS=""
  NEUSTARTS="$(docker inspect -f '{{.RestartCount}}' brdms_backend 2>/dev/null || echo 0)"
  for _ in $(seq 1 90); do
    if docker logs --since "$START_ZEIT" brdms_backend 2>&1 | grep -q "Starte Server"; then ERGEBNIS="ok"; break; fi
    # Bricht der Abgleich ab, beendet sich der Container (und wird ggf. neu gestartet)
    ZUSTAND="$(docker inspect -f '{{.RestartCount}} {{.State.Running}}' brdms_backend 2>/dev/null || echo "? false")"
    if [ "$ZUSTAND" != "$NEUSTARTS true" ]; then ERGEBNIS="fehler"; break; fi
    sleep 2
  done
  if [ "$ERGEBNIS" = "ok" ]; then
    echo "  ✓ Datenbankstruktur auf Stand ${STAND_VERSION:-des Systems} gebracht"
  else
    echo "  ⚠ Das Backend meldet beim Start einen Fehler oder brauchte zu lange. Log prüfen:"
    echo "    docker logs brdms_backend --tail 60"
  fi
fi

echo ""
echo "[$(date)] Restore abgeschlossen."
echo "  Bitte prüfe das System unter der konfigurierten APP_URL (siehe .env)."
