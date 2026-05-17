# Server Setup Agent — Syrex API on strideit.syrexbatteries.in

You are a deployment agent running on an Ubuntu 24.04 VPS. Your job is to fully set up and deploy the Syrex application from GitHub. Execute every step in order. Do not skip steps. Verify each step before moving to the next.

---

## Who You Are / What You Have

- **You are**: Claude Code running as user `ashish` on this VPS
- **OS**: Ubuntu 24.04 LTS
- **Resources**: 4 vCPU, 15 GB RAM, 197 GB SSD
- **Your user**: `ashish` (uid=1000, has passwordless `sudo`)
- **Nginx**: already running on 80/443 with existing sites
- **Certbot**: already installed (`certbot --nginx` plugin available)
- **What's NOT installed yet**: Bun, PostgreSQL, Node.js, npm, gh CLI

---

## What You Are Deploying

A monorepo with:
- **Backend**: Bun runtime + Hono HTTP framework + tRPC API, port 3000
  - Cron jobs run in-process (field auto-start every minute, auto-close at 13:30 UTC)
  - SSE endpoint at `/field/live-stream` (needs nginx proxy with buffering OFF)
  - Only 3 env vars needed: `NODE_ENV`, `PORT`, `DATABASE_URL`
- **Web**: React + Vite SPA (admin dashboard)
  - Must be built with `VITE_API_URL=https://strideit.syrexbatteries.in` baked in
  - Served as static files by nginx
  - API routes (`/trpc/*`, `/api/*`, `/field/*`) proxied by nginx to backend on port 3000
- **Database**: PostgreSQL (required, no alternative)
- **Schema**: Lives at repo root as `schema.prisma` (NOT inside `backend/`)

---

## Secrets You Must Ask the User For (BEFORE STARTING)

Ask the user to provide these before you begin. Write them down:

1. **GITHUB_PAT**: A GitHub Personal Access Token with `repo` (read) scope. Used to clone `https://github.com/ashishkaushik05/syrex-complete-monorepo`. Generate at: GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained or Classic.

2. **DB_PASSWORD**: A strong password you will set for the `syrex` PostgreSQL user. Generate one if not provided: `openssl rand -base64 24 | tr -d '/+=' | head -c 32`

---

## Important Quirks (Read Before Starting)

1. **Prisma schema is at repo ROOT**, not inside `backend/`. The backend references it as `../schema.prisma`. This is intentional.

2. **Prisma generate requires a `package.json` at repo root** or it fails. There is none in the repo. Workaround: create a temp one, generate, delete it. Exact commands are in Step 7.

3. **The `db:seed` script** creates roles (Admin/Sales/Warehouse) and 3 dev users using `upsert` — safe to re-run. The admin login for first access is `admin@syrex.local` / `admin123`. **This password must be changed immediately after first login.**

4. **Web build**: The web app embeds `VITE_API_URL` at build time. If you build without it, the production app will try to hit `http://localhost:3000` from the browser and fail. Always pass it as an env var during build.

5. **The `start` script** for the backend is simply `bun run src/index.ts`. The systemd service uses the full path `/home/ashish/.bun/bin/bun`.

---

## Step-by-Step Execution

### STEP 1 — Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
# Reload shell env so bun is in PATH for current session:
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version
# Should print: 1.x.x
```

### STEP 2 — Install Node.js + npm (needed only for web build)

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should be v22.x
npm --version
```

### STEP 3 — Install PostgreSQL 16

```bash
sudo apt install -y postgresql-16
sudo systemctl enable --now postgresql
sudo systemctl status postgresql | head -5
```

### STEP 4 — Create PostgreSQL database and user

Replace `<DB_PASSWORD>` with the password from the user:

```bash
sudo -u postgres psql << 'SQL'
CREATE USER syrex WITH PASSWORD '<DB_PASSWORD>';
CREATE DATABASE syrex OWNER syrex;
\q
SQL

# Verify connection works:
psql "postgresql://syrex:<DB_PASSWORD>@localhost:5432/syrex" -c "SELECT 1 AS ok;"
# Should print: ok = 1
```

### STEP 5 — Clone the repository

Replace `<GITHUB_PAT>` with the token from the user:

```bash
sudo mkdir -p /srv/syrex-api
sudo chown ashish:ashish /srv/syrex-api

git clone https://ashishkaushik05:<GITHUB_PAT>@github.com/ashishkaushik05/syrex-complete-monorepo.git /srv/syrex-api

ls /srv/syrex-api
# Should show: backend/ web/ mobile/ schema.prisma plan/ CLAUDE.md ...
```

### STEP 6 — Install backend dependencies

```bash
cd /srv/syrex-api/backend
bun install
# Should install ~50 packages. Prisma binary included.
ls node_modules/.bin/prisma   # must exist
```

### STEP 7 — Prisma generate (IMPORTANT: needs temp root package.json)

```bash
cd /srv/syrex-api

# Create temp package.json at repo root (required for prisma generate to work):
echo '{"name":"syrex-root","version":"1.0.0"}' > package.json

# Generate Prisma client:
backend/node_modules/.bin/prisma generate --schema schema.prisma

# Remove temp file:
rm package.json

# Verify generation succeeded:
ls backend/node_modules/.prisma/client/index.js && echo "OK"
```

### STEP 8 — Create production .env

Replace `<DB_PASSWORD>` with the actual password:

```bash
cat > /srv/syrex-api/backend/.env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://syrex:<DB_PASSWORD>@localhost:5432/syrex
EOF

chmod 600 /srv/syrex-api/backend/.env
cat /srv/syrex-api/backend/.env   # verify (it's safe to print here, it's localhost creds)
```

### STEP 9 — Push DB schema and seed data

```bash
cd /srv/syrex-api/backend

# Push schema to DB (creates all 49 tables):
PRISMA_GENERATE_SKIP_AUTOINSTALL=1 \
  ~/.bun/bin/bunx prisma db push \
  --schema ../schema.prisma \
  --skip-generate

# Seed roles + 3 dev users (upsert, safe to re-run):
~/.bun/bin/bun run scripts/dev-seed.ts

# Verify tables exist:
psql "postgresql://syrex:<DB_PASSWORD>@localhost:5432/syrex" \
  -c "\dt" | head -20
```

### STEP 10 — Smoke-test the backend

```bash
# Start backend temporarily in background:
cd /srv/syrex-api/backend
~/.bun/bin/bun run src/index.ts &
BUN_PID=$!
sleep 3

# Test health:
curl -s http://localhost:3000/health
# Expected: {"status":"ok"}

curl -s http://localhost:3000/ready
# Expected: {"status":"ready"}

# Stop temp process:
kill $BUN_PID
```

If `/ready` returns `{"status":"not_ready"}` — check DATABASE_URL in `.env` and re-run Step 8.

### STEP 11 — Build the web app

```bash
cd /srv/syrex-api/web
npm install

# Build with production API URL baked in:
VITE_API_URL=https://strideit.syrexbatteries.in npm run build

ls dist/index.html && echo "Build OK"
# dist/ should contain index.html + assets/
```

### STEP 12 — Create systemd service

```bash
sudo tee /etc/systemd/system/syrex-api.service > /dev/null << 'EOF'
[Unit]
Description=Syrex API (Bun + Hono + tRPC)
After=network.target postgresql.service

[Service]
Type=simple
User=ashish
WorkingDirectory=/srv/syrex-api/backend
EnvironmentFile=/srv/syrex-api/backend/.env
ExecStart=/home/ashish/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=syrex-api

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now syrex-api
sleep 3
sudo systemctl status syrex-api

# Should show: Active: active (running)
```

If it fails: `sudo journalctl -u syrex-api -n 50 --no-pager`

### STEP 13 — Nginx site configuration

```bash
sudo tee /etc/nginx/sites-available/strideit.syrexbatteries.in > /dev/null << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name strideit.syrexbatteries.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name strideit.syrexbatteries.in;

    # certbot will fill these in (Step 14):
    # ssl_certificate ...
    # ssl_certificate_key ...

    root /srv/syrex-api/web/dist;
    index index.html;

    # SSE live-stream: buffering MUST be off, long timeout
    location = /field/live-stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # All API and health routes → Bun backend on :3000
    location ~ ^/(trpc|api|health|ready|field)/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # React SPA: serve index.html for all unmatched routes (client-side routing)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

# Enable the site:
sudo ln -sf /etc/nginx/sites-available/strideit.syrexbatteries.in \
            /etc/nginx/sites-enabled/strideit.syrexbatteries.in

# Test config:
sudo nginx -t
# Expected: syntax is ok / test is successful

# Reload nginx:
sudo systemctl reload nginx
```

### STEP 14 — Issue SSL certificate

**Only run this after DNS has propagated** (strideit.syrexbatteries.in must resolve to 45.195.159.172).

Verify DNS first:
```bash
dig +short strideit.syrexbatteries.in A
# Must return: 45.195.159.172
# If it returns nothing or a different IP — WAIT and retry. Do not run certbot yet.
```

Once DNS resolves correctly:
```bash
sudo certbot --nginx -d strideit.syrexbatteries.in
# Follow prompts: enter email, agree to ToS, choose redirect (option 2)
# Certbot will automatically edit the nginx config and add ssl_certificate lines
```

---

## Final Verification

Run all of these. Every one must pass:

```bash
# 1. Backend service running
sudo systemctl is-active syrex-api
# → active

# 2. Health endpoint
curl -s https://strideit.syrexbatteries.in/health
# → {"status":"ok"}

# 3. DB connected
curl -s https://strideit.syrexbatteries.in/ready
# → {"status":"ready"}

# 4. Web SPA loads
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://strideit.syrexbatteries.in/
# → HTTP 200

# 5. SSL valid
curl -sv https://strideit.syrexbatteries.in/health 2>&1 | grep "SSL connection"
# → SSL connection using TLS...

# 6. Nginx config still clean
sudo nginx -t
# → syntax is ok
```

---

## If Something Goes Wrong

| Problem | Debug command |
|---|---|
| Bun service not starting | `sudo journalctl -u syrex-api -n 50 --no-pager` |
| DB connection refused | `sudo systemctl status postgresql` |
| Prisma errors | Check `DATABASE_URL` in `/srv/syrex-api/backend/.env` |
| Nginx 502 | `curl http://localhost:3000/health` (is Bun running?) |
| SSL cert fails | `dig +short strideit.syrexbatteries.in A` (DNS propagated?) |
| Web shows blank page | Check browser console — likely `VITE_API_URL` was not set during build |

---

## After Everything Works — Tell the User

Report back:
1. `https://strideit.syrexbatteries.in` is live
2. Admin login: `admin@syrex.local` / `admin123` — **user must change this password**
3. The systemd service `syrex-api` is enabled and will restart automatically on reboot
4. Certbot auto-renewal is active (`sudo certbot renew --dry-run` to verify)
5. Paste the output of: `sudo systemctl status syrex-api` and `curl -s https://strideit.syrexbatteries.in/health`
