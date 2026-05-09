#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
TMP_SCHEMA="$BACKEND_DIR/.tmp.phase5.schema.prisma"
PG_CONTAINER="syrex_phase5_pg"
PG_PORT="54350"
API_PORT="3005"
DB_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/syrex"

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -f "$TMP_SCHEMA"
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for phase5 smoke test" >&2
  exit 1
fi

if ! docker ps -a --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
  docker run -d \
    --name "$PG_CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_DB=syrex \
    -p "${PG_PORT}:5432" \
    postgres:16 >/dev/null
else
  docker start "$PG_CONTAINER" >/dev/null || true
fi

for _ in {1..30}; do
  if docker exec "$PG_CONTAINER" pg_isready -U postgres -d syrex >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$PG_CONTAINER" pg_isready -U postgres -d syrex >/dev/null 2>&1; then
  echo "postgres did not become ready" >&2
  exit 1
fi

cd "$BACKEND_DIR"
cp "$ROOT_DIR/schema.prisma" "$TMP_SCHEMA"
PRISMA_GENERATE_SKIP_AUTOINSTALL=1 DATABASE_URL="$DB_URL" bunx prisma generate --schema "$TMP_SCHEMA" >/dev/null
DATABASE_URL="$DB_URL" bunx prisma db push --schema "$TMP_SCHEMA" --force-reset --accept-data-loss >/dev/null
DATABASE_URL="$DB_URL" bun run scripts/dev-seed.ts >/tmp/syrex_phase5_seed.log 2>&1

DATABASE_URL="$DB_URL" PORT="$API_PORT" bun run src/index.ts >/tmp/syrex_phase5_api.log 2>&1 &
API_PID=$!

for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null
curl -fsS "http://127.0.0.1:${API_PORT}/ready" >/dev/null

PHASE5_BASE_URL="http://127.0.0.1:${API_PORT}" DATABASE_URL="$DB_URL" bun run scripts/phase5-smoke-client.ts

echo "phase5 smoke passed"
