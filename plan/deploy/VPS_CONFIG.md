# VPS Configuration Reference

Production server: `ashish@45.195.159.172` — port `2222`  
SSH key: `~/.ssh/strideit`  
Domain: `strideit.syrexbatteries.in`  
Last audited: `2026-05-20`

---

## 1. Server Basics

| Item | Value |
|---|---|
| OS | Ubuntu (LTS) |
| Shell | bash/zsh |
| Primary user | `ashish` |
| App root | `/srv/syrex-api` |
| Downloads dir | `/srv/downloads` |
| Logs dir | `/srv/syrex-api/logs` |
| Node (via nvm) | v24.15.0 |
| Bun | latest (via `~/.bun/bin/bun`) |
| PATH override required | `export PATH="/home/ashish/.bun/bin:/home/ashish/.nvm/versions/node/v24.15.0/bin:$PATH"` |

> **Compatibility note:** All deploy scripts must prepend the PATH override above. systemd does not inherit user PATH; the override is set explicitly in the CI deploy step and should be set in the service unit's `Environment=` line.

---

## 2. systemd Service — `syrex-api`

Service file: `/etc/systemd/system/syrex-api.service`

```ini
[Unit]
Description=Syrex API (Bun + Hono)
After=network.target postgresql.service

[Service]
User=ashish
WorkingDirectory=/srv/syrex-api/backend
Environment=PATH=/home/ashish/.bun/bin:/home/ashish/.nvm/versions/node/v24.15.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=/srv/syrex-api/backend/.env
ExecStart=/home/ashish/.bun/bin/bun run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Management commands:**
```bash
sudo systemctl restart syrex-api
sudo systemctl status syrex-api
sudo journalctl -u syrex-api -f          # tail logs
sudo journalctl -u syrex-api --since "10 min ago"
```

**Compatibility constraints:**
- `bun run start` resolves to `src/index.ts` via `backend/package.json` scripts.
- Service reads `backend/.env` — this file is **not in git**; written by the CI deploy step from the `PROD_DATABASE_URL` GitHub secret. If the service fails after a fresh git clone, write the `.env` manually (see §5).

---

## 3. Nginx

Config file: `/etc/nginx/sites-available/strideit.syrexbatteries.in`  
Enabled via: `/etc/nginx/sites-enabled/strideit.syrexbatteries.in` (symlink)

### Current location blocks (HTTPS server)

| Location | Behaviour |
|---|---|
| `/downloads/` | `alias /srv/downloads/;` — static APK download, Content-Disposition: attachment |
| `/field/live-stream` | SSE proxy → `http://127.0.0.1:3000`; `proxy_buffering off`, `proxy_read_timeout 3600s` |
| `/health` | proxy → `http://127.0.0.1:3000` |
| `/ready` | proxy → `http://127.0.0.1:3000` |
| `~ ^/(trpc\|api\|field)/` | proxy → `http://127.0.0.1:3000` |
| `/` | `try_files $uri $uri/ /index.html;` (SPA fallback) |

Static root: `/srv/syrex-api/web/dist`

SSL: Let's Encrypt / Certbot — auto-renews via cron.

**Management commands:**
```bash
sudo nginx -t                # test config before reload
sudo nginx -s reload         # graceful reload (no downtime)
sudo systemctl restart nginx # full restart (brief downtime)
```

**Compatibility constraints:**
- The `location /downloads/` block must appear **before** `location /` in the config file, otherwise the SPA catch-all intercepts it.
- The SSE block (`/field/live-stream`) needs `proxy_buffering off` and a long read timeout — do not normalise it to the standard proxy block.
- Web dist must exist at `/srv/syrex-api/web/dist` before nginx starts; a missing dist dir will 404 all non-API routes.

---

## 4. PostgreSQL

| Item | Value |
|---|---|
| Version | system default (Ubuntu apt) |
| Host | `localhost:5432` |
| Database | `syrex` |
| User | `syrex` |
| Password | stored in `PROD_DATABASE_URL` GitHub secret only |

Connection string format:
```
postgresql://syrex:<password>@localhost:5432/syrex
```

> **Note:** Password contains `#` — it must be percent-encoded as `%23` in the connection string. The raw value in the secret is `postgresql://syrex:Pisner%23999@localhost:5432/syrex`.

**Management commands:**
```bash
sudo -u postgres psql                         # postgres superuser shell
sudo -u postgres psql -c "\l"                # list databases
sudo systemctl status postgresql
```

**Compatibility constraints:**
- Prisma schema is at repo root (`schema.prisma`). Generating the client requires a temp `package.json` at repo root (see §6).
- `prisma db push --force-reset` is run on every CI deploy — wipes all data. Remove this flag before real customer data enters production (tracked in DEC-20260520-002).

---

## 5. Environment File — `backend/.env`

**Not tracked in git.** Written by the CI deploy step from the GitHub Actions secret `PROD_DATABASE_URL`.

Expected content:
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://syrex:Pisner%23999@localhost:5432/syrex
```

To write manually on the VPS:
```bash
printf 'NODE_ENV=production\nPORT=3000\nDATABASE_URL=postgresql://syrex:Pisner%%23999@localhost:5432/syrex\n' \
  > /srv/syrex-api/backend/.env
```

> **`%%23` vs `%23`:** In a `printf` format string the `%` must be doubled to `%%` to output a literal `%`. The file on disk will contain `%23`.

---

## 6. Prisma Schema — Generation Workaround

The schema lives at repo root (`/srv/syrex-api/schema.prisma`). Prisma requires a `package.json` in the working directory:

```bash
cd /srv/syrex-api
echo '{"name":"syrex-root","version":"1.0.0"}' > package.json
backend/node_modules/.bin/prisma generate --schema schema.prisma
rm -f package.json
```

This workaround is also in the CI deploy script. If you see `Error: The provided schema path … does not exist`, check that you are running from repo root with the temp `package.json` present.

---

## 7. CI/CD Pipeline — GitHub Actions

File: `.github/workflows/deploy.yml`

| Job | Trigger | What it does |
|---|---|---|
| `backend-check` | every push to master | `bun install`, Prisma generate, `bun run typecheck`, `rbac:preflight` |
| `web-check` | every push to master | `npm ci`, `npm run build` (tsc + vite), `npm run lint` |
| `report` | always (after above) | SCP CI report → `/srv/syrex-api/logs/ci-<sha>.txt`; run `~/gen_deployed_logs.sh` |
| `deploy` | only if backend+web both pass | git pull, write .env, bun install, prisma generate + db push + seed, web build, nginx reload, systemd restart, health check |

**Required GitHub Secrets:**

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | private key matching `~/.ssh/strideit` on VPS (entire PEM including headers) |
| `PROD_DATABASE_URL` | `postgresql://syrex:Pisner%23999@localhost:5432/syrex` |

Set at: GitHub repo → Settings → Secrets and variables → Actions.

**Health check:** After restart the deploy job polls `http://localhost:3000/health` up to 10 times (3s apart). Deploy fails if `"ok"` is not returned.

---

## 8. APK Distribution

| File | Path on VPS | Public URL |
|---|---|---|
| Sales app (syrex-sales) | `/srv/downloads/syrex-sales.apk` | `https://strideit.syrexbatteries.in/downloads/syrex-sales.apk` |
| Outlet app (syrex-outlet) | `/srv/downloads/syrex-outlet.apk` | `https://strideit.syrexbatteries.in/downloads/syrex-outlet.apk` |

Built with:
```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://strideit.syrexbatteries.in/trpc \
  --dart-define=APP_ENV=prod
```

**Signing:** Debug key (no production keystore yet). APKs are functional but not Play Store submittable.

To update APKs after a build:
```bash
scp -P 2222 -i ~/.ssh/strideit \
  mobile/sales_mobile_app/build/app/outputs/flutter-apk/app-release.apk \
  ashish@45.195.159.172:/srv/downloads/syrex-sales.apk

scp -P 2222 -i ~/.ssh/strideit \
  mobile/outlet_owner_template/build/app/outputs/flutter-apk/app-release.apk \
  ashish@45.195.159.172:/srv/downloads/syrex-outlet.apk
```

---

## 9. CI Log Files on VPS

| File | Purpose |
|---|---|
| `/srv/syrex-api/logs/ci-<sha>.txt` | Full output for each CI run (backend + web) |
| `/srv/syrex-api/logs/ci-summary.log` | One-liner per run: sha, timestamp, pass/fail flags |
| `/home/ashish/deployed_logs.md` | Human-readable summary of last 2 CI runs — regenerated by `~/gen_deployed_logs.sh` |

To regenerate `deployed_logs.md` manually:
```bash
ssh -p 2222 ashish@45.195.159.172 '~/gen_deployed_logs.sh'
```

---

## 10. Seed Users (demo-seed.ts)

All passwords follow `email.split("@")[0] + "123"`.

| Email | Password | Role | Notes |
|---|---|---|---|
| admin@syrex.local | admin123 | Admin | Full permissions |
| ops@syrex.local | ops123 | Admin | Operations lead |
| sales1@syrex.local | sales1123 | Sales | Field enabled |
| sales2@syrex.local | sales2123 | Sales | Field enabled |
| finance@syrex.local | finance123 | Admin | Finance |
| whnorth@syrex.local | whnorth123 | Warehouse Manager | North warehouse |
| whsouth@syrex.local | whsouth123 | Warehouse Manager | South warehouse |
| prime@syrex.local | prime123 | Sales | Outlet user |
| city@syrex.local | city123 | Sales | Outlet user |
| metro@syrex.local | metro123 | Sales | Outlet user |

> **Warning:** DB is wiped and re-seeded on every CI deploy. Do not enter real data until `--force-reset` is removed from the deploy script (DEC-20260520-002).

---

## 11. Compatibility Checklist — Before Any Infrastructure Change

- [ ] PATH includes Bun and nvm Node before running any `bun` or `npm` commands.
- [ ] `backend/.env` exists and contains all three required vars before starting the service.
- [ ] Prisma generate uses the temp `package.json` workaround at repo root.
- [ ] nginx config tested with `sudo nginx -t` before reload.
- [ ] `location /downloads/` block is placed before `location /` in nginx config.
- [ ] SSE location block retains `proxy_buffering off` and `proxy_read_timeout 3600s`.
- [ ] GitHub secrets `DEPLOY_SSH_KEY` and `PROD_DATABASE_URL` are set before triggering CI.
- [ ] `PROD_DATABASE_URL` secret value uses `%23` (percent-encoded `#`) not literal `#`.
