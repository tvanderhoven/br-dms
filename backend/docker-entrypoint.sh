#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-100}

echo "[entrypoint] UID=${PUID}, GID=${PGID}"

chown -R ${PUID}:${PGID} /data 2>/dev/null || true
chown -R ${PUID}:${PGID} /app/node_modules/.prisma /app/node_modules/@prisma/engines 2>/dev/null || true

echo "[entrypoint] Schema-Sync (prisma db push)..."
su-exec ${PUID}:${PGID} npx prisma db push --skip-generate

echo "[entrypoint] Starte Server..."
exec su-exec ${PUID}:${PGID} node dist/index.js
