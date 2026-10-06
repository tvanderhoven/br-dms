#!/bin/bash
# ================================================================
#  BR-DMS Demo-Instanz auf diesem PC
#
#  ./demo/demo.sh start   – bauen, starten, beim ersten Mal Demodaten einspielen
#  ./demo/demo.sh stop    – anhalten (Daten bleiben erhalten)
#  ./demo/demo.sh reset   – alles löschen und mit frischen Demodaten neu starten
#  ./demo/demo.sh logs    – Backend-Log verfolgen
#  ./demo/demo.sh entfernen – Demo komplett löschen (Container, Daten, Images,
#                             Schlüssel und Zertifikat der Demo)
# ================================================================
set -e

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$DEMO_DIR")"
ENV_DATEI="$DEMO_DIR/.env.demo"

compose() {
  docker compose -p brdms-demo \
    --project-directory "$REPO_DIR" \
    --env-file "$ENV_DATEI" \
    -f "$REPO_DIR/docker-compose.yml" \
    -f "$DEMO_DIR/docker-compose.demo.yml" "$@"
}

env_anlegen() {
  [ -f "$ENV_DATEI" ] && return
  echo "[Demo] Erzeuge $ENV_DATEI mit zufälligen Schlüsseln …"
  cat > "$ENV_DATEI" <<ENV
# Automatisch erzeugt von demo.sh – nur für die lokale Demo, nicht committen
DATA_PATH=$DEMO_DIR
PUID=$(id -u)
PGID=$(id -g)
POSTGRES_USER=brdms
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=brdms_demo
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_EMAIL=admin@nordwerk-demo.lokal
ADMIN_PASSWORD=Demo2026!
DEMO_PASSWORD=Demo2026!
APP_URL=https://localhost:8444
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
WATCH_FOLDER_ENABLED=false
PROXY_HTTPS_PORT=8444
PROXY_HTTP_PORT=8082
ENV
}

zertifikat_anlegen() {
  [ -f "$DEMO_DIR/certs/fullchain.pem" ] && return
  bash "$REPO_DIR/proxy/generate-selfsigned-cert.sh" "$DEMO_DIR" "$(hostname)" >/dev/null 2>&1
  echo "[Demo] Selbstsigniertes Zertifikat erzeugt"
}

warte_auf_backend() {
  echo -n "[Demo] Warte auf Backend "
  for _ in $(seq 1 90); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' brdms_demo_backend 2>/dev/null)" = "healthy" ]; then
      echo " bereit."
      return
    fi
    echo -n "."
    sleep 2
  done
  echo
  echo "[Demo] Backend wurde nicht rechtzeitig bereit – siehe: ./demo/demo.sh logs"
  exit 1
}

demodaten_einspielen() {
  # Das Skript prüft selbst, ob die Datenbank leer ist, und bricht sonst ab
  docker exec -u "$(id -u):$(id -g)" brdms_demo_backend node dist/demo/demo-daten.js \
    || echo "[Demo] Keine Demodaten eingespielt (Datenbank war schon befüllt)."
}

case "${1:-start}" in
  start)
    env_anlegen
    zertifikat_anlegen
    compose up -d --build
    warte_auf_backend
    demodaten_einspielen
    echo
    echo "[Demo] Läuft unter: https://localhost:8444"
    ;;
  stop)
    compose stop
    ;;
  reset)
    env_anlegen
    compose down -v
    "$0" start
    ;;
  logs)
    compose logs -f backend
    ;;
  entfernen)
    if [ ! -f "$ENV_DATEI" ]; then
      echo "[Demo] Keine Demo-Instanz gefunden (demo/.env.demo fehlt)."
      exit 0
    fi
    read -r -p "[Demo] Demo-Instanz mit allen Demodaten endgültig löschen? [j/N] " antwort
    case "$antwort" in j|J|ja|Ja) ;; *) echo "[Demo] Abgebrochen."; exit 0 ;; esac
    # Nur das Compose-Projekt "brdms-demo" – eine echte Installation bleibt unberührt
    compose down -v --rmi local --remove-orphans
    rm -rf "$DEMO_DIR/certs" "$ENV_DATEI"
    echo "[Demo] Demo-Instanz entfernt. Neu anlegen jederzeit mit: ./demo/demo.sh start"
    ;;
  *)
    echo "Aufruf: $0 {start|stop|reset|logs|entfernen}"
    exit 1
    ;;
esac
