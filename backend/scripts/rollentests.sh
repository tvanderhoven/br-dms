#!/usr/bin/env bash
# ================================================================
#  BR-DMS – Rollentests
#  Startet eine Wegwerf-PostgreSQL per Docker (nur im RAM), legt das
#  Schema an und prüft, welche Rolle welche API-Route aufrufen darf.
#  Echte Daten werden nie berührt.
#
#  Aufruf:  bash backend/scripts/rollentests.sh
#  Rechte-Übersicht nach bewusster Änderung neu schreiben:
#           RECHTE_AKTUALISIEREN=1 bash backend/scripts/rollentests.sh
#  Mit vorhandener Test-Datenbank (z. B. in GitHub Actions):
#           TEST_DATABASE_URL=postgresql://… bash backend/scripts/rollentests.sh
# ================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CONTAINER=""
TMPDIR_TEST="$(mktemp -d)"
aufraeumen() {
  [ -n "$CONTAINER" ] && docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$TMPDIR_TEST"
}
trap aufraeumen EXIT

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  CONTAINER="brdms_rollentest_$$"
  echo "[rollentests] Starte Wegwerf-PostgreSQL …"
  docker run -d --rm --name "$CONTAINER" \
    -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=brdms_test \
    --tmpfs /var/lib/postgresql/data \
    -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$CONTAINER" pg_isready -U test -d brdms_test >/dev/null 2>&1 && break
    sleep 1
  done
  # pg_isready meldet sich schon während des Init-Neustarts – kurz nachfassen
  sleep 2
  docker exec "$CONTAINER" pg_isready -U test -d brdms_test >/dev/null
  PORT="$(docker port "$CONTAINER" 5432/tcp | head -1 | sed 's/.*://')"
  TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:${PORT}/brdms_test"
fi

export DATABASE_URL="$TEST_DATABASE_URL"
export BRDMS_TESTDB=1
export NODE_ENV=test
export JWT_SECRET="rollentest-$(openssl rand -hex 16)"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
export STORAGE_PATH="$TMPDIR_TEST/storage"
export BACKUP_PATH="$TMPDIR_TEST/backups"
mkdir -p "$STORAGE_PATH" "$BACKUP_PATH"

echo "[rollentests] Schema anlegen …"
npx prisma db push --skip-generate --accept-data-loss >/dev/null

echo "[rollentests] Typprüfung …"
npx tsc -p test/tsconfig.json

echo "[rollentests] Tests laufen …"
node --import tsx --test --test-concurrency=1 test/*.test.ts
