#!/usr/bin/env bash
# ================================================================
#  BR-DMS – deploy_update.sh  (Linux / macOS)
#  Überträgt die Quelldateien aus deploy_dateien.txt in EINER
#  SSH-Verbindung (tar-Pipe) und zeigt danach die Rebuild-Befehle.
#
#  ./deploy_update.sh            übertragen
#  ./deploy_update.sh --trocken  nur anzeigen, was übertragen würde
#  ./deploy_update.sh --bauen    übertragen und direkt neu bauen/starten
# ================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${DEPLOY_ENV:-${DIR}/.env.deploy}"   # DEPLOY_ENV/DEPLOY_SSH nur für Tests überschreiben
SSH="${DEPLOY_SSH:-ssh}"
LISTE="${DIR}/deploy_dateien.txt"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLD='\033[1m'; NC='\033[0m'

MODUS="${1:-}"
case "${MODUS}" in
  ""|--trocken|--bauen) ;;
  *) echo "Aufruf: $0 [--trocken|--bauen]"; exit 1 ;;
esac

# ── Konfiguration laden ───────────────────────────────────────────
[ -f "${ENV}" ] || { echo -e "${RED}Fehler:${NC} .env.deploy nicht gefunden (Vorlage: .env.deploy.example)."; exit 1; }

# Fehlt ein (optionaler) Schlüssel, liefert grep nichts – das darf set -e nicht abbrechen
wert() { { grep -E "^$1=" "${ENV}" || true; } | head -1 | cut -d= -f2- | tr -d "\"'" | sed 's/[[:space:]]*#.*$//; s/[[:space:]]*$//'; }
NAS_USER=$(wert NAS_USER)
NAS_HOST=$(wert NAS_HOST)
DATA_PATH=$(wert DATA_PATH); DATA_PATH="${DATA_PATH%/}"
DOCKER=$(wert DOCKER_BIN)

[ -n "${NAS_USER}" ] && [ -n "${NAS_HOST}" ] && [ -n "${DATA_PATH}" ] \
  || { echo -e "${RED}Fehler:${NC} NAS_USER, NAS_HOST und DATA_PATH müssen in .env.deploy gesetzt sein."; exit 1; }
[[ "${DATA_PATH}" == /*/* ]] \
  || { echo -e "${RED}Fehler:${NC} DATA_PATH muss ein absoluter Pfad mit mindestens zwei Ebenen sein (ist: '${DATA_PATH}')."; exit 1; }

# docker-Programm: aus DOCKER_BIN, sonst am Pfad erkennen (QNAP /share/…, Synology /volume…)
if [ -z "${DOCKER}" ]; then
  case "${DATA_PATH}" in
    /share/*)  DOCKER="/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker" ;;
    /volume*)  DOCKER="/usr/local/bin/docker" ;;
    *)         DOCKER="docker" ;;
  esac
fi

ZIEL="${NAS_USER}@${NAS_HOST}"
DC="${DATA_PATH}/docker-compose.yml"
COMPOSE="sudo ${DOCKER} compose -f ${DC}"

# ── Dateiliste lesen ──────────────────────────────────────────────
QUELLEN=(); ERSETZEN=()
while read -r pfad markierung; do
  [[ -z "${pfad}" || "${pfad}" == \#* ]] && continue
  [ -e "${DIR}/${pfad}" ] || { echo -e "${RED}Fehler:${NC} ${pfad} fehlt lokal (siehe deploy_dateien.txt)."; exit 1; }
  QUELLEN+=("${pfad}")
  [ "${markierung:-}" = "*" ] && ERSETZEN+=("${pfad}")
done < "${LISTE}"

echo ""
echo -e "${BLD}================================================================${NC}"
echo -e "${BLD}  BR-DMS Update-Deploy${NC}"
echo -e "${BLD}================================================================${NC}"
echo -e "  Ziel   : ${ZIEL}"
echo -e "  Pfad   : ${DATA_PATH}"
echo -e "  docker : ${DOCKER}"
echo -e "${BLD}================================================================${NC}"
echo ""

cd "${DIR}"
TAR_OPTS=(--exclude='node_modules' --exclude='dist' --exclude='.env' --exclude='*.env' --exclude='.env.local' --exclude='__pycache__')

if [ "${MODUS}" = "--trocken" ]; then
  echo -e "  ${BLD}Probelauf – würde übertragen:${NC}"
  tar -czf - "${TAR_OPTS[@]}" "${QUELLEN[@]}" | tar -tzf - | grep -v '/$' | sed 's/^/    /'
  echo ""
  echo -e "  Auf dem Host ersetzt (nicht nur überschrieben): ${ERSETZEN[*]}"
  exit 0
fi

echo -e "  Übertrage Dateien (einmalig Passwort eingeben) …"

# Auf dem Host erst in einen Zwischenordner entpacken und die markierten Ordner
# danach ersetzen – bricht die Übertragung ab, bleibt der alte Stand vollständig.
REMOTE="set -e
mkdir -p '${DATA_PATH}' && cd '${DATA_PATH}'
rm -rf .deploy-neu && mkdir .deploy-neu
tar -xzf - -C .deploy-neu
for d in ${ERSETZEN[*]}; do rm -rf \"\$d\"; done
cp -a .deploy-neu/. . && rm -rf .deploy-neu
chmod +x backup.sh restore.sh proxy/generate-selfsigned-cert.sh backend/docker-entrypoint.sh"

tar -czf - "${TAR_OPTS[@]}" "${QUELLEN[@]}" | ${SSH} "${ZIEL}" "${REMOTE}"

echo -e "  ${GRN}✓ Übertragung abgeschlossen${NC}"

if [ "${MODUS}" = "--bauen" ]; then
  echo ""
  echo -e "  Baue und starte auf dem Host (sudo-Passwort des Hosts) …"
  ${SSH} -t "${ZIEL}" "${COMPOSE} up -d --build"
  echo -e "  ${GRN}✓ Container neu gebaut und gestartet${NC}"
  echo ""
  echo -e "  Logs: ${YLW}ssh ${ZIEL} \"sudo ${DOCKER} logs brdms_backend --tail 40 -f\"${NC}"
  echo ""
  exit 0
fi

# ── Nächste Schritte anzeigen ─────────────────────────────────────
echo ""
echo -e "${BLD}================================================================${NC}"
echo -e "${BLD}  Jetzt per SSH auf dem Host ausführen:${NC}"
echo -e "${BLD}================================================================${NC}"
echo ""
echo -e "  ${BLD}SSH verbinden:${NC}"
echo -e "  ${YLW}ssh ${ZIEL}${NC}"
echo ""
echo -e "  ${BLD}Option A – Alles neu bauen (Backend + Frontend):${NC}"
echo -e "  ${YLW}${COMPOSE} up -d --build${NC}"
echo ""
echo -e "  ${BLD}Option B – Nur Backend:${NC}"
echo -e "  ${YLW}${COMPOSE} build backend && ${COMPOSE} up -d${NC}"
echo ""
echo -e "  ${BLD}Option C – Nur Frontend (ohne Cache):${NC}"
echo -e "  ${YLW}${COMPOSE} build --no-cache frontend && ${COMPOSE} up -d${NC}"
echo ""
echo -e "  ${BLD}Logs prüfen:${NC}"
echo -e "  ${YLW}sudo ${DOCKER} logs brdms_backend --tail 40 -f${NC}"
echo ""
echo -e "  Tipp: ${BLD}./deploy_update.sh --bauen${NC} erledigt Übertragung und Option A in einem Schritt."
echo ""
echo -e "${BLD}================================================================${NC}"
echo -e "${BLD}  Backup & Restore (auf dem Host ausführen):${NC}"
echo -e "${BLD}================================================================${NC}"
echo ""
echo -e "  ${BLD}Manuelles Backup erstellen:${NC}"
echo -e "  ${YLW}sudo bash ${DATA_PATH}/backup.sh${NC}"
echo ""
echo -e "  ${BLD}Backup wiederherstellen (interaktiv):${NC}"
echo -e "  ${YLW}sudo bash ${DATA_PATH}/restore.sh${NC}"
echo ""
