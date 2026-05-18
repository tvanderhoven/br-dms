#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-100}

echo "[entrypoint] UID=${PUID}, GID=${PGID}"

chown -R ${PUID}:${PGID} /data 2>/dev/null || true
chown -R ${PUID}:${PGID} /app/node_modules/.prisma /app/node_modules/@prisma/engines 2>/dev/null || true

echo "[entrypoint] Warte auf PostgreSQL..."
RETRIES=30
until nc -z postgres 5432 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "[entrypoint] FEHLER: PostgreSQL nach 60s nicht erreichbar. Abbruch."
    exit 1
  fi
  echo "[entrypoint] PostgreSQL noch nicht bereit... ($RETRIES Versuche)"
  sleep 2
done
echo "[entrypoint] PostgreSQL bereit."

echo "[entrypoint] Schema-Sync (prisma db push)..."
su-exec ${PUID}:${PGID} npx prisma db push --skip-generate

echo "[entrypoint] Starte Server..."
exec su-exec ${PUID}:${PGID} node dist/index.js
