#!/usr/bin/env bash
# ================================================================
#  BR-DMS – demo_modus.sh: Demodaten auf dem Server ausprobieren
#
#  Schaltet eine Installation vorübergehend auf Demodaten um – etwa damit
#  das Gremium BR-DMS gefahrlos ausprobieren kann – und danach zurück auf
#  die echten Daten. Läuft auf QNAP, Synology und Linux.
#
#    sudo bash demo_modus.sh status   zeigt, welche Daten gerade laufen
#    sudo bash demo_modus.sh demo     echte Daten sichern, Demodaten einspielen
#    sudo bash demo_modus.sh neu      Demo von vorn beginnen (echte Sicherung bleibt)
#    sudo bash demo_modus.sh echt     Demodaten löschen, echte Daten zurückholen
#
#  Muss im Datenverzeichnis (DATA_PATH) neben .env, backup.sh und restore.sh liegen.
#  Die echten Daten liegen während der Demo in sicherung_vor_demo/<Zeit>/
#  (Datenbank, Dokumente, .env) – außerhalb von backups/, wo backup.sh nach
#  30 Tagen aufräumt.
# ================================================================
set -euo pipefail

# Im Aufgabenplaner und per SSH fehlt docker oft im PATH – bekannte Orte auf QNAP und Synology
PATH="$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin:/usr/local/bin"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DIR/.env"
MERKER="$DIR/.demo_modus"            # vorhanden = Demo läuft; enthält den Pfad der Sicherung
SICHERUNGEN="$DIR/sicherung_vor_demo"
BACKEND="brdms_backend"
POSTGRES="brdms_postgres"
DEMO_DOMAIN="nordwerk-demo.lokal"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLD='\033[1m'; NC='\033[0m'
fehler()  { echo -e "\n  ${RED}Fehler:${NC} $*" >&2; exit 1; }
schritt() { echo -e "\n  ${BLD}→ $*${NC}"; }
ok()      { echo -e "    ${GRN}✓${NC} $*"; }
hinweis() { echo -e "    ${YLW}!${NC} $*"; }

# Wert aus der .env lesen, ohne sie zu sourcen (SMTP_FROM enthält < >)
wert() {
  { grep -E "^$1=" "${2:-$ENV_FILE}" || true; } | tail -1 | cut -d= -f2- | tr -d '\r' \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

bestaetigen() {   # $1 = Wort, das eingetippt werden muss
  echo ""
  read -rp "  Zum Fortfahren „$1“ eintippen (alles andere bricht ab): " antwort
  [ "$antwort" = "$1" ] || { echo "  Abgebrochen – nichts geändert."; exit 0; }
}

# ── Voraussetzungen ───────────────────────────────────────────────
MODUS="${1:-}"
case "$MODUS" in status|demo|neu|echt) ;; *)
  echo "Aufruf: sudo bash $0 {status|demo|neu|echt}"; exit 1 ;;
esac

[ -f "$ENV_FILE" ] || fehler "$ENV_FILE nicht gefunden – das Skript muss im Datenverzeichnis neben der .env liegen."
[ -f "$DIR/docker-compose.yml" ] || fehler "docker-compose.yml fehlt in $DIR."
DATA_PATH="$(wert DATA_PATH)"; DATA_PATH="${DATA_PATH%/}"
[[ "$DATA_PATH" == /*/* ]] || fehler "DATA_PATH in der .env muss ein absoluter Pfad sein (ist: '$DATA_PATH')."

command -v docker >/dev/null 2>&1 || fehler "docker nicht gefunden."
docker info >/dev/null 2>&1 || fehler "Kein Zugriff auf Docker – bitte mit sudo starten: sudo bash $0 $MODUS"
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE=(docker-compose)
else fehler "Weder „docker compose“ noch „docker-compose“ gefunden."; fi
compose() { (cd "$DIR" && "${COMPOSE[@]}" "$@"); }

POSTGRES_IMAGE="$(grep -E '^[[:space:]]*image:[[:space:]]*postgres' "$DIR/docker-compose.yml" | head -1 | awk '{print $2}')"
[ -n "$POSTGRES_IMAGE" ] || fehler "postgres-Image in docker-compose.yml nicht gefunden."

# Datenbank-Ordner und Dokumente leeren. Läuft in einem Container, weil die Datenbankdateien
# dem postgres-Benutzer gehören; eingebunden wird nur genau dieser eine Ordner.
leeren() {
  local ziel="$DATA_PATH/$1"
  mkdir -p "$ziel"
  docker run --rm -v "$ziel:/leeren" --entrypoint sh "$POSTGRES_IMAGE" \
    -c 'rm -rf /leeren/* /leeren/.[!.]* /leeren/..?* 2>/dev/null; true'
}

warte_auf_backend() {
  echo -n "    Warte auf das Backend "
  for _ in $(seq 1 90); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$BACKEND" 2>/dev/null)" = "healthy" ]; then
      echo " bereit."; return 0
    fi
    echo -n "."; sleep 2
  done
  echo ""
  fehler "Das Backend ist nach 3 Minuten nicht bereit. Log ansehen: sudo docker logs $BACKEND --tail 40"
}

# Anzahl Benutzer mit Demo-Adresse (0 = keine Demodaten); leer, wenn die Datenbank nicht antwortet
demo_benutzer() {
  local u d
  u="$(docker exec "$POSTGRES" printenv POSTGRES_USER 2>/dev/null)" || return 0
  d="$(docker exec "$POSTGRES" printenv POSTGRES_DB 2>/dev/null)" || return 0
  docker exec "$POSTGRES" psql -U "$u" -d "$d" -Atc \
    "select count(*) from benutzer where email like '%@$DEMO_DOMAIN'" 2>/dev/null || true
}

demodaten_einspielen() {
  local puid pgid
  puid="$(wert PUID)"; pgid="$(wert PGID)"
  schritt "Demodaten einspielen (dauert etwa eine Minute, Gesetzestexte brauchen Internet)"
  docker exec -u "${puid:-1000}:${pgid:-100}" "$BACKEND" node dist/demo/demo-daten.js \
    || fehler "Demodaten konnten nicht eingespielt werden (Meldung oben). Die echten Daten sind gesichert – zurück mit: sudo bash $0 echt"
  ok "Demodaten eingespielt"
}

leer_starten() {
  schritt "Container stoppen"
  compose down
  schritt "Datenbank und Dokumente leeren (backups, .env und Zertifikate bleiben)"
  leeren postgres
  leeren storage
  ok "geleert"
  schritt "Leer starten"
  compose up -d
  warte_auf_backend
}

anmeldung_zeigen() {
  local pw; pw="$(wert DEMO_PASSWORD)"
  echo ""
  echo -e "  ${BLD}Anmelden${NC} (Passwort für alle Demo-Konten: ${BLD}${pw:-Demo2026!}${NC}):"
  echo "    s.kroeger@$DEMO_DOMAIN   Vorsitz"
  echo "    t.brandt@$DEMO_DOMAIN    Stellvertretung"
  echo "    m.yilmaz@$DEMO_DOMAIN    Mitglied"
  echo "    m.engel@$DEMO_DOMAIN     Ersatzmitglied"
  echo "    f.albers@$DEMO_DOMAIN    JAV"
  echo "  Alle Konten: Einstellungen → Benutzer (als Admin aus der .env)."
}

# ── status ────────────────────────────────────────────────────────
if [ "$MODUS" = "status" ]; then
  echo ""
  anzahl="$(demo_benutzer)"
  if [ -f "$MERKER" ]; then
    echo -e "  Es laufen ${BLD}DEMODATEN${NC} (seit $(wert seit "$MERKER"))."
    echo "  Echte Daten gesichert in: $(wert sicherung "$MERKER")"
    echo "  Zurück zu den echten Daten: sudo bash $0 echt"
  elif [ -n "$anzahl" ] && [ "$anzahl" -gt 0 ]; then
    echo -e "  Es laufen ${BLD}DEMODATEN${NC} – aber ohne Merker dieses Skripts (von Hand eingespielt?)."
  else
    echo -e "  Es laufen die ${BLD}ECHTEN DATEN${NC}."
  fi
  if [ -d "$SICHERUNGEN" ]; then
    echo ""; echo "  Vorhandene Sicherungen vor einer Demo:"
    ls -1 "$SICHERUNGEN" | sed 's/^/    /'
  fi
  echo ""; exit 0
fi

# ── demo ──────────────────────────────────────────────────────────
if [ "$MODUS" = "demo" ]; then
  [ -f "$MERKER" ] && fehler "Die Demo läuft bereits. Neu beginnen: sudo bash $0 neu – zurück: sudo bash $0 echt"
  anzahl="$(demo_benutzer)"
  [ -n "$anzahl" ] && [ "$anzahl" -gt 0 ] && fehler "In der Datenbank sind schon Demodaten – die würden sonst als „echte Daten“ gesichert. Erst prüfen (sudo bash $0 status)."
  admin_pw="$(wert ADMIN_PASSWORD)"
  [ "${#admin_pw}" -ge 8 ] || fehler "ADMIN_PASSWORD in der .env fehlt oder ist kürzer als 8 Zeichen – ohne startet eine leere Installation nicht. Erst eintragen, dann erneut starten."
  [ -n "$(wert BACKUP_KEY)" ] || hinweis "Kein BACKUP_KEY in der .env – die Sicherung der echten Daten wird unverschlüsselt."

  echo ""
  echo -e "  ${BLD}Umschalten auf Demodaten${NC}"
  echo "    1. Backup der echten Daten (backup.sh) und Kopie nach sicherung_vor_demo/"
  echo "    2. .env sichern; E-Mail-Versand und Watch-Folder für die Demo ausschalten"
  echo "    3. Datenbank und Dokumente leeren, Demodaten einspielen"
  echo -e "  Die echten Daten sind danach ${BLD}nur noch in der Sicherung${NC} – zurück mit: sudo bash $0 echt"
  bestaetigen "DEMO"

  ZEIT="$(date +%Y%m%d_%H%M%S)"
  ZIEL="$SICHERUNGEN/$ZEIT"

  schritt "Backup der echten Daten"
  bash "$DIR/backup.sh"
  DB_DATEI="$(ls -1t "$DATA_PATH"/backups/db_*.sql.gz* 2>/dev/null | head -1 || true)"
  [ -n "$DB_DATEI" ] || fehler "Kein Backup gefunden – nichts geändert."
  STEMPEL="$(basename "$DB_DATEI" | sed -e 's/^db_//' -e 's/\.sql\.gz.*//')"
  STORAGE_DATEI="$(ls -1 "$DATA_PATH"/backups/storage_"$STEMPEL".tar.gz* 2>/dev/null | head -1 || true)"
  [ -n "$STORAGE_DATEI" ] || fehler "Zum Backup $STEMPEL fehlt das Dokumenten-Archiv – nichts geändert."

  schritt "Sicherung nach $ZIEL kopieren"
  mkdir -p "$ZIEL"; chmod 700 "$SICHERUNGEN" "$ZIEL"
  cp -a "$DB_DATEI" "$STORAGE_DATEI" "$ZIEL/"
  cp -a "$ENV_FILE" "$ZIEL/env.echt"; chmod 600 "$ZIEL"/*
  [ -s "$ZIEL/$(basename "$DB_DATEI")" ] && [ -s "$ZIEL/$(basename "$STORAGE_DATEI")" ] && [ -s "$ZIEL/env.echt" ] \
    || fehler "Die Kopie in $ZIEL ist unvollständig – nichts geändert."
  ok "Datenbank, Dokumente und .env gesichert"
  printf 'seit=%s\nsicherung=%s\n' "$(date '+%d.%m.%Y %H:%M')" "$ZIEL" > "$MERKER"

  schritt ".env für die Demo anpassen"
  sed -i 's/^SMTP_/#SMTP_/' "$ENV_FILE"
  if grep -q '^WATCH_FOLDER_ENABLED=' "$ENV_FILE"; then
    sed -i 's/^WATCH_FOLDER_ENABLED=.*/WATCH_FOLDER_ENABLED=false/' "$ENV_FILE"
  else
    echo "WATCH_FOLDER_ENABLED=false" >> "$ENV_FILE"
  fi
  ok "E-Mail-Versand und Watch-Folder aus (Original in $ZIEL/env.echt)"

  leer_starten
  demodaten_einspielen

  echo ""
  echo -e "  ${GRN}${BLD}Fertig – es laufen jetzt die Demodaten.${NC}"
  anmeldung_zeigen
  echo ""
  echo -e "  ${YLW}Tipp:${NC} Die beiden Backup-Dateien aus $ZIEL zusätzlich auf einen PC kopieren."
  echo "  Zurück zu den echten Daten: sudo bash $0 echt"
  echo ""
  exit 0
fi

# ── neu ───────────────────────────────────────────────────────────
if [ "$MODUS" = "neu" ]; then
  [ -f "$MERKER" ] || fehler "Es läuft keine Demo dieses Skripts – zum Umschalten: sudo bash $0 demo"
  echo ""
  echo -e "  ${BLD}Demo von vorn beginnen${NC}: alles, was in der Demo angelegt wurde, wird gelöscht."
  echo "  Die Sicherung der echten Daten bleibt unberührt."
  bestaetigen "NEU"
  leer_starten
  demodaten_einspielen
  echo ""; echo -e "  ${GRN}${BLD}Fertig – frische Demodaten.${NC}"; anmeldung_zeigen; echo ""
  exit 0
fi

# ── echt ──────────────────────────────────────────────────────────
if [ -f "$MERKER" ]; then
  ZIEL="$(wert sicherung "$MERKER")"
else
  ZIEL="$(ls -1d "$SICHERUNGEN"/*/ 2>/dev/null | tail -1 || true)"; ZIEL="${ZIEL%/}"
  [ -n "$ZIEL" ] || fehler "Keine Sicherung in $SICHERUNGEN gefunden."
  hinweis "Kein Merker gefunden – nehme die jüngste Sicherung: $ZIEL"
fi
DB_DATEI="$(ls -1 "$ZIEL"/db_*.sql.gz* 2>/dev/null | head -1 || true)"
[ -n "$DB_DATEI" ] && [ -f "$ZIEL/env.echt" ] || fehler "Sicherung in $ZIEL ist unvollständig (Datenbank oder env.echt fehlt)."
STEMPEL="$(basename "$DB_DATEI" | sed -e 's/^db_//' -e 's/\.sql\.gz.*//')"
ls "$ZIEL"/storage_"$STEMPEL".tar.gz* >/dev/null 2>&1 || fehler "In $ZIEL fehlt das Dokumenten-Archiv zum Backup $STEMPEL."

echo ""
echo -e "  ${BLD}Zurück zu den echten Daten${NC} aus $ZIEL"
echo "    1. .env der echten Installation zurückholen (E-Mail, Watch-Folder, Schlüssel)"
echo "    2. Demodaten löschen"
echo "    3. Datenbank und Dokumente aus der Sicherung einspielen"
echo -e "  Alles, was in der Demo angelegt wurde, ist danach ${BLD}weg${NC}."
bestaetigen "ECHT"

schritt "Container stoppen"
compose down
schritt ".env zurückholen"
cp -a "$ZIEL/env.echt" "$ENV_FILE"; chmod 600 "$ENV_FILE"
ok ".env der echten Installation aktiv"
schritt "Datenbank und Dokumente leeren"
leeren postgres
leeren storage
ok "geleert"
schritt "Leer starten"
compose up -d
warte_auf_backend

schritt "Echte Daten einspielen (restore.sh)"
bash "$DIR/restore.sh" "$DB_DATEI" --mit-storage --ja \
  || fehler "Wiederherstellung fehlgeschlagen (Meldung oben). Die Sicherung in $ZIEL ist unverändert – Befehl erneut ausführen."
warte_auf_backend
rm -f "$MERKER"

echo ""
echo -e "  ${GRN}${BLD}Fertig – es laufen wieder die echten Daten.${NC}"
echo "  Bitte einmal anmelden und ein Dokument öffnen."
echo "  Die Sicherung $ZIEL kann gelöscht werden, sobald alles geprüft ist."
echo ""
