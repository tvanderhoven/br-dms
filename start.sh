#!/usr/bin/env bash
# ================================================================
#  BR-DMS – start.sh
#  Einstiegspunkt für alle Docker-Operationen
# ================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${DIR}/.env"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GRN}[BR-DMS]${NC} $*"; }
warn() { echo -e "${YLW}[BR-DMS]${NC} $*"; }
err()  { echo -e "${RED}[BR-DMS]${NC} $*" >&2; }

# ── .env prüfen & sicher laden ────────────────────────────────────
[ -f "${ENV}" ] || { err ".env fehlt – bitte: cp .env.example .env && nano .env"; exit 1; }

# Sicheres Parsen: kein `source`, daher keine Bash-Interpretation
# von Sonderzeichen (!$`\) in Passwörtern.
# Unterstützt: KEY=value  und  KEY="value"  und  KEY='value'
while IFS= read -r line || [[ -n "$line" ]]; do
  # Leerzeilen und Kommentare überspringen
  [[ "$line" =~ ^[[:space:]]*$ ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue

  # KEY=VALUE trennen
  key="${line%%=*}"
  val="${line#*=}"

  # Anführungszeichen entfernen (einfach und doppelt)
  val="${val#\"}" ; val="${val%\"}"
  val="${val#\'}" ; val="${val%\'}"

  # Nur gültige Variablennamen exportieren
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && export "$key=$val"
done < "${ENV}"

for var in JWT_SECRET ENCRYPTION_KEY POSTGRES_PASSWORD; do
  [[ "${!var:-}" == *"BITTE_AENDERN"* ]] && { err "${var} ist noch nicht gesetzt!"; exit 1; }
done

# ── Verzeichnisse anlegen (einmalig) ──────────────────────────────
init_dirs() {
  local base="${DATA_PATH:?DATA_PATH fehlt in .env}"
  local dirs=(
    "${base}/postgres"
    "${base}/storage/anhoerungen"
    "${base}/storage/bewerbungen"
    "${base}/storage/protokolle"
    "${base}/logs"
    "${base}/watch_inbox"
  )
  for d in "${dirs[@]}"; do
    mkdir -p "${d}" && log "  ✓ ${d}"
  done
  chown -R "${PUID}:${PGID}" "${base}/"
  log "Verzeichnisse bereit."
}

# ── Hauptmenü ─────────────────────────────────────────────────────
cd "${DIR}"

case "${1:-up}" in
  init)
    log "Erstelle Verzeichnisstruktur auf NAS (${DATA_PATH:-nicht gesetzt})..."; init_dirs ;;
  up)
    log "Starte BR-DMS..."
    docker compose up -d --build
    NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || hostname -i 2>/dev/null | awk '{print $1}')
    log "Backend:  http://${NAS_IP}:${BACKEND_PORT:-4000}" ;;
  down)
    log "Stoppe BR-DMS..."; docker compose down ;;
  restart)
    docker compose restart "${2:-}" ;;
  logs)
    docker compose logs -f --tail=100 "${2:-}" ;;
  update)
    log "Update..."
    docker compose pull
    docker compose up -d --build ;;
  backup)
    TS=$(date +%Y%m%d_%H%M%S)
    BK="${DATA_PATH}/backups/${TS}"
    mkdir -p "${BK}"
    docker compose exec -T postgres \
      pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${BK}/db.sql"
    log "Backup gespeichert: ${BK}/db.sql"
    warn "Storage-Ordner separat sichern: ${DATA_PATH}/storage/" ;;
  *)
    echo "Verwendung: $0 [init|up|down|restart|logs|update|backup]"
    exit 1 ;;
esac
