# Server Agent — Follow-up Fix Prompt

You previously set up the Syrex API deployment on this VPS. Two issues remain. Fix them in order.

---

## Context / What Happened

1. **web/ was missing from your clone** — it was added in a commit pushed AFTER your original clone. A `git pull` will bring it in.
2. **500 error on strideit.syrexbatteries.in** — the nginx config for this domain has `listen 443 ssl` but the `ssl_certificate` lines are commented out. Cloudflare (which is proxying this domain) connects to the origin on port 443, finds no cert, and 500s. We will fix this by generating a self-signed certificate for the origin — Cloudflare's "Full" SSL mode accepts self-signed certs.

The domain `strideit.syrexbatteries.in` is behind Cloudflare proxy (resolves to Cloudflare IPs, not the VPS IP directly). This is fine and intentional. Cloudflare handles TLS for users; the origin (this server) just needs any HTTPS cert (self-signed is OK for now).

---

## STEP A — Pull latest code (gets web/)

```bash
cd /srv/syrex-api
git pull origin master

# Verify web/ now exists:
ls web/src/main.tsx && echo "web/ present"
```

If `git pull` fails with auth errors, re-authenticate:
```bash
gh auth setup-git
git pull origin master
```

---

## STEP B — Build the web app

```bash
cd /srv/syrex-api/web
npm install

# IMPORTANT: VITE_API_URL must be set — it gets baked into the JS bundle at build time
VITE_API_URL=https://strideit.syrexbatteries.in npm run build

# Verify:
ls dist/index.html && echo "Build OK"
ls dist/assets/ | head -5
```

If the build fails, check for TypeScript errors — run `npm run build 2>&1 | tail -30` to see the error.

---

## STEP C — Generate a self-signed TLS certificate for the origin

Cloudflare will accept this when SSL mode is set to "Full" (not "Full Strict").

```bash
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/private/strideit-selfsigned.key \
  -out /etc/ssl/certs/strideit-selfsigned.crt \
  -subj "/CN=strideit.syrexbatteries.in/O=Syrex/C=IN"

# Verify files created:
ls -la /etc/ssl/private/strideit-selfsigned.key
ls -la /etc/ssl/certs/strideit-selfsigned.crt
```

---

## STEP D — Rewrite the nginx config with the self-signed cert

Replace the entire nginx site config:

```bash
sudo tee /etc/nginx/sites-available/strideit.syrexbatteries.in > /dev/null << 'NGINXEOF'
server {
    listen 80;
    listen [::]:80;
    server_name strideit.syrexbatteries.in;
    # Cloudflare will always hit us on 443 when proxy is enabled,
    # but keep 80 redirect as a safety net for direct connections.
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name strideit.syrexbatteries.in;

    ssl_certificate     /etc/ssl/certs/strideit-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/strideit-selfsigned.key;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

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

    # API + health routes → Bun backend on :3000
    location ~ ^/(trpc|api|health|ready|field)/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # React SPA fallback — serve index.html for all unmatched routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

# Test and reload:
sudo nginx -t && sudo systemctl reload nginx
echo "Nginx reloaded OK"
```

---

## STEP E — Tell the user to set Cloudflare SSL mode

The user must log into the Cloudflare dashboard and set the SSL/TLS encryption mode for this domain to **"Full"** (not "Full Strict"). Path:
- Cloudflare Dashboard → syrexbatteries.in → SSL/TLS → Overview → select **Full**

"Full" accepts self-signed origin certs. "Full Strict" requires a CA-signed cert (which we don't have yet). "Flexible" would also work but is less secure.

**You cannot do this step yourself — tell the user what to do.**

---

## STEP F — Verify everything from the server side

After the user sets Cloudflare to "Full":

```bash
# 1. Backend service still running?
sudo systemctl is-active syrex-api
# → active

# 2. Backend health check directly (bypasses nginx/CF):
curl -s http://localhost:3000/health
# → {"status":"ok"}

curl -s http://localhost:3000/ready
# → {"status":"ready"}

# 3. Test nginx serves correctly on localhost 443 (self-signed, so -k to skip cert verify):
curl -sk https://localhost/health -H "Host: strideit.syrexbatteries.in"
# → {"status":"ok"}

# 4. Static web file served:
curl -sk https://localhost/ -H "Host: strideit.syrexbatteries.in" -o /dev/null -w "HTTP %{http_code}\n"
# → HTTP 200

# 5. Nginx config clean:
sudo nginx -t
# → syntax is ok
```

---

## STEP G — Test through Cloudflare (after user sets SSL to Full)

```bash
curl -s https://strideit.syrexbatteries.in/health
# → {"status":"ok"}

curl -s https://strideit.syrexbatteries.in/ready
# → {"status":"ready"}

curl -s -o /dev/null -w "HTTP %{http_code}\n" https://strideit.syrexbatteries.in/
# → HTTP 200
```

---

## Report Back to User

Once all steps pass, tell the user:

1. **strideit.syrexbatteries.in is live** ✓
2. Backend: `{"status":"ok"}` and `{"status":"ready"}`
3. Web app: serving from `/srv/syrex-api/web/dist`
4. SSL: self-signed cert on origin, Cloudflare terminates TLS for users
5. Admin login: `admin@syrex.local` / `admin123` — **change this password immediately**
6. Service auto-starts on reboot (`systemctl is-enabled syrex-api`)

Paste the output of:
```bash
sudo systemctl status syrex-api --no-pager | head -15
curl -s https://strideit.syrexbatteries.in/health
```

---

## If Something Goes Wrong

| Symptom | Cause | Fix |
|---|---|---|
| `git pull` auth error | gh token expired | `gh auth setup-git` then retry |
| Web build fails | TypeScript errors | `npm run build 2>&1 \| tail -40` to see error |
| nginx -t fails | Syntax error in config | `sudo nginx -t` shows which line |
| 502 Bad Gateway | Bun not running | `sudo systemctl restart syrex-api` |
| 500 still after nginx reload | Old cached config? | `sudo systemctl restart nginx` (not just reload) |
| Cloudflare still 500 | SSL mode still "Flexible" or "Full Strict" | User must set Cloudflare SSL → Full |
| Web shows blank page in browser | VITE_API_URL not set during build | Rebuild: `VITE_API_URL=https://strideit.syrexbatteries.in npm run build` |
