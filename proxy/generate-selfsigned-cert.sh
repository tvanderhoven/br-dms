#!/bin/bash
# Erzeugt ein selbstsigniertes TLS-Zertifikat fuer den BR-DMS Reverse-Proxy.
# Einmalig vor dem ersten "docker compose up" ausfuehren (oder erneut zum Erneuern).
# Browser warnen bei einem selbstsignierten Zertifikat, bis es einmalig pro PC
# als vertrauenswuerdig markiert wird - siehe README, Abschnitt "HTTPS aktivieren".
#
# Aufruf: bash generate-selfsigned-cert.sh <DATA_PATH> [zusaetzlicher-name ...]
# Beispiel: bash generate-selfsigned-cert.sh /share/Container/br-dms br-nas 192.168.1.100

set -e

DATA_PATH="${1:?Bitte DATA_PATH als ersten Parameter angeben, z.B. /share/Container/br-dms}"
shift || true

CERT_DIR="$DATA_PATH/certs"
mkdir -p "$CERT_DIR"

# SAN-Liste zusammenbauen: localhost + alle weiteren uebergebenen Namen/IPs
SAN="DNS:localhost"
for name in "$@"; do
  if [[ "$name" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    SAN="$SAN,IP:$name"
  else
    SAN="$SAN,DNS:$name"
  fi
done

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -days 825 \
  -subj "/CN=br-dms" \
  -addext "subjectAltName=$SAN"

echo "Zertifikat erzeugt in $CERT_DIR (gueltig 825 Tage), SAN: $SAN"
echo "Danach: docker compose up -d --build (bzw. restart proxy, falls schon gestartet)"
