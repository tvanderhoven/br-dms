#!/usr/bin/env bash
# ================================================================
#  BR-DMS – deploy_update.sh
#  Überträgt alle Quell-Dateien in EINER SSH-Verbindung (tar-Pipe)
#  und zeigt danach die Rebuild-Befehle an.
# ================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${DIR}/.env.deploy"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLD='\033[1m'; NC='\033[0m'

# ── Konfiguration laden ───────────────────────────────────────────
[ -f "${ENV}" ] || { echo -e "${RED}Fehler:${NC} .env.deploy nicht gefunden."; exit 1; }

NAS_USER=$(grep -E '^NAS_USER=' "${ENV}" | cut -d= -f2 | tr -d "\"'" | head -1)
NAS_HOST=$(grep -E '^NAS_HOST='  "${ENV}" | cut -d= -f2 | tr -d "\"'" | head -1)
DATA_PATH=$(grep -E '^DATA_PATH=' "${ENV}" | cut -d= -f2 | tr -d "\"'" | head -1)

ZIEL="${NAS_USER}@${NAS_HOST}"
DC="${DATA_PATH}/docker-compose.yml"

echo ""
echo -e "${BLD}================================================================${NC}"
echo -e "${BLD}  BR-DMS Update-Deploy${NC}"
echo -e "${BLD}================================================================${NC}"
echo -e "  Ziel : ${ZIEL}"
echo -e "  Pfad : ${DATA_PATH}"
echo -e "${BLD}================================================================${NC}"
echo ""
echo -e "  Übertrage Dateien (einmalig PW eingeben) …"

# ── Alles in einer SSH-Verbindung per tar-Pipe übertragen ─────────
# Lokal: tar packt alle Quell-Dateien
# Remote: tar entpackt direkt in DATA_PATH
cd "${DIR}"

tar -czf - \
  --exclude='*.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='__pycache__' \
  backend/src \
  backend/prisma \
  backend/Dockerfile \
  backend/docker-entrypoint.sh \
  backend/package.json \
  backend/tsconfig.json \
  frontend/src \
  frontend/index.html \
  frontend/nginx.conf \
  frontend/package.json \
  frontend/postcss.config.js \
  frontend/tailwind.config.js \
  frontend/tsconfig.json \
  frontend/vite.config.ts \
  docker-compose.yml \
  backup.sh \
  restore.sh \
| ssh "${ZIEL}" "tar -xzf - -C '${DATA_PATH}' && chmod +x '${DATA_PATH}/backup.sh' '${DATA_PATH}/restore.sh'"

echo -e "  ${GRN}✓ Übertragung abgeschlossen${NC}"

# ── Nächste Schritte anzeigen ─────────────────────────────────────
echo ""
echo -e "${BLD}================================================================${NC}"
echo -e "${BLD}  Jetzt per SSH auf dem NAS ausführen:${NC}"
echo -e "${BLD}================================================================${NC}"
echo ""
echo -e "  ${BLD}SSH verbinden:${NC}"
echo -e "  ${YLW}ssh ${ZIEL}${NC}"
echo ""
echo -e "  ${BLD}Option A – Alles neu bauen (Backend + Frontend):${NC}"
echo -e "  ${YLW}sudo /usr/local/bin/docker compose -f ${DC} up -d --build${NC}"
echo ""
echo -e "  ${BLD}Option B – Nur Backend:${NC}"
echo -e "  ${YLW}sudo /usr/local/bin/docker compose -f ${DC} build backend && sudo /usr/local/bin/docker compose -f ${DC} up -d${NC}"
echo ""
echo -e "  ${BLD}Option C – Nur Frontend:${NC}"
echo -e "  ${YLW}sudo /usr/local/bin/docker compose -f ${DC} build --no-cache frontend && sudo /usr/local/bin/docker compose -f ${DC} up -d${NC}"
echo ""
echo -e "  ${BLD}Logs prüfen:${NC}"
echo -e "  ${YLW}sudo /usr/local/bin/docker logs brdms_backend --tail 40 -f${NC}"
echo ""
echo -e "${BLD}================================================================${NC}"
echo -e "${BLD}  Backup & Restore (auf dem NAS ausführen):${NC}"
echo -e "${BLD}================================================================${NC}"
echo ""
echo -e "  ${BLD}Manuelles Backup erstellen:${NC}"
echo -e "  ${YLW}sudo bash ${DATA_PATH}/backup.sh${NC}"
echo ""
echo -e "  ${BLD}Backup wiederherstellen (interaktiv):${NC}"
echo -e "  ${YLW}sudo bash ${DATA_PATH}/restore.sh${NC}"
echo ""
