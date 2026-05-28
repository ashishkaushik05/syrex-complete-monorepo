#!/usr/bin/env bash
# Deploy script — run on the VPS as user ashish.
# Called by GitHub Actions on every master push that passes CI.
# Does NOT touch .env or reset the database.
set -euo pipefail

export PATH="/home/ashish/.bun/bin:$PATH"
BUN=/home/ashish/.bun/bin/bun

echo "=== Deploy started at $(date -u '+%Y-%m-%d %H:%M UTC') ==="
echo "    commit: $(cd /srv/syrex-api && git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo ""
echo "▶ Pulling latest code..."
cd /srv/syrex-api
git pull origin master
echo "    now at: $(git rev-parse --short HEAD)"

echo ""
echo "▶ Installing backend deps..."
cd /srv/syrex-api/backend
$BUN install --frozen-lockfile

echo ""
echo "▶ Regenerating Prisma client..."
cd /srv/syrex-api
echo '{"name":"syrex-root","version":"1.0.0"}' > package.json
backend/node_modules/.bin/prisma generate --schema schema.prisma
rm -f package.json

echo ""
echo "▶ Rebuilding web dashboard..."
cd /srv/syrex-api/web
npm ci --prefer-offline
VITE_API_URL=https://strideit.syrexbatteries.in npm run build

echo ""
echo "▶ Restarting API service..."
sudo systemctl restart syrex-api

echo ""
echo "▶ Health check (30 s window)..."
for i in $(seq 1 10); do
  sleep 3
  if curl -sf http://localhost:3000/health 2>/dev/null | grep -q '"ok"'; then
    echo "✓ Deploy successful at $(date -u '+%Y-%m-%d %H:%M UTC')"
    exit 0
  fi
  echo "  waiting... ($i/10)"
done
echo "✗ Health check failed — check: journalctl -u syrex-api -n 50"
exit 1
