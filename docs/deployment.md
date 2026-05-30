# Deployment

Self-host XCrawl on any Linux box with Docker. The repo ships a single
`docker-compose.yml` that runs the full stack (API, workers, dashboard,
Postgres, Redis, SearXNG, Caddy reverse proxy) behind one domain with
automatic HTTPS.

## 1. Deployment options

Pick one. All three use the same `docker-compose.yml`; the differences are in
how traffic reaches the server.

| Option | Public ports open? | Public IP needed? | Best for |
|--------|-------------------|-------------------|----------|
| **VPS + domain** | 80, 443 | yes | Hetzner / DigitalOcean / Hostinger / your own server |
| **Home server + Cloudflare Tunnel** | none | no | Self-hosting at home, behind NAT, dynamic IP |
| **LAN only** | none (LAN only) | no | Internal tools, no domain |

For LAN-only, swap `XCRAWL_DOMAIN=xcrawl.example.com` for a private hostname
(e.g. `xcrawl.lan`) and reach it through your local DNS / hosts file. Caddy
will fall back to its internal CA and you'll need to trust its root cert on
client machines, or replace the Caddyfile's site block with `:80` for HTTP only.

## 2. Prerequisites

- Linux host with Docker 24+ and the Compose plugin
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```
- At least 4 GB RAM, 2 vCPU, 30 GB disk. Playwright + Chromium is the heavy
  part — workers need headroom.
- One of:
  - A domain with an A/AAAA record pointing at the server (VPS path), OR
  - A Cloudflare account (Tunnel path).
- Open ports 80 and 443 if you go the VPS route. Tunnel mode needs no
  inbound ports.

## 3. VPS quick start (Hetzner CX22 / DigitalOcean / similar)

```bash
# On the server
sudo apt update && sudo apt install -y git
git clone https://github.com/MrMirhan/xcrawl.git
cd xcrawl
cp .env.production.example .env
```

Edit `.env` and at minimum fill:

- `XCRAWL_DOMAIN` — the hostname pointing here
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `POSTGRES_PASSWORD` — a strong password
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — your initial login
- `SEARXNG_SECRET` — `openssl rand -hex 32`

Point DNS at the server and wait for it to propagate (`dig $XCRAWL_DOMAIN`).
Then:

```bash
docker compose up -d --build
```

First build takes 5–10 minutes (mostly Playwright + Chromium download). Watch
progress with `docker compose logs -f api`. Caddy obtains a Let's Encrypt
certificate on the first HTTPS request.

## 4. Configure `.env` — generating secrets

```bash
# Strong random secrets
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # SEARXNG_SECRET

# Postgres password — long and random
openssl rand -base64 24
```

Required values with no defaults:

| Variable | Purpose |
|----------|---------|
| `XCRAWL_DOMAIN` | Hostname Caddy obtains a cert for |
| `JWT_SECRET` | Signs every login token |
| `POSTGRES_PASSWORD` | Database password |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin login |
| `SEARXNG_SECRET` | Required by SearXNG itself |

Everything else has sensible defaults — see `.env.production.example` for the
full list with comments.

## 5. Build and run

```bash
docker compose up -d --build
docker compose ps        # all services should be "running" or "healthy"
docker compose logs -f   # ctrl+c to detach
```

Services on the internal `xcrawl-internal` network:

```
caddy:80,443  (only one published to the host)
  +-- api:3001          NestJS, BullMQ producer
  +-- worker x2         BullMQ consumers (scaled via deploy.replicas)
  +-- web:3000          Next.js dashboard
  +-- searxng:8080      Search backend
  +-- postgres:5432
  +-- redis:6379
  +-- garage:3900       (optional, --profile s3)
```

Open `https://$XCRAWL_DOMAIN` and sign in with the admin credentials. The
Swagger docs live at `https://$XCRAWL_DOMAIN/api/docs`.

## 6. First-time setup — seeding the admin user

The admin user is seeded into Postgres on first run. If your first request
returns a login error, run:

```bash
docker compose exec api node -e "require('./node_modules/@xcrawl/db/dist/seed.js')"
```

Or, if you want to seed from the host before starting the stack, install
deps locally and run the workspace script:

```bash
pnpm install
pnpm run db:seed
```

The seed script reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

## 7. Cloudflare Tunnel (alternative to public ports)

Use this if your server is behind NAT, your ISP blocks ports 80/443, or you
want Cloudflare's edge in front.

1. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels** and
   click **Create a tunnel**. Pick the "Cloudflared" connector. Copy the
   token shown on the next screen.
2. In `.env` set `TUNNEL_TOKEN=eyJh...`.
3. In `docker-compose.yml`:
   - Remove the `ports:` block from the `caddy` service (or comment the
     entire `caddy` service out if you don't want Caddy at all — but keeping
     it as an internal router makes single-hostname setups much simpler).
   - Uncomment the `cloudflared` service near the bottom.
4. In the Cloudflare tunnel dashboard, add a **Public hostname**:
   - Subdomain + domain: pick the one you want
   - Service type: `HTTP`
   - URL: `caddy:80` (if you kept Caddy) or `web:3000` + a second
     hostname for `api:3001` if you removed it
5. `docker compose up -d`.

Verify with:

```bash
docker compose logs cloudflared | grep "Registered tunnel"
curl -I https://your-hostname.example.com
```

The config-file flavor (routes defined in `docker/cloudflared.yml` instead
of the Cloudflare dashboard) is documented inside that file.

## 8. Updates

```bash
git pull
docker compose pull        # refreshes Postgres, Redis, Caddy, SearXNG
docker compose up -d --build api worker web
```

Rebuilding only `api`, `worker`, `web` skips the base images and is much
faster than a full `--build`. If you changed `Dockerfile.api` or the lockfile
add `--no-cache`.

Database migrations are applied automatically by Prisma's `db push` during
the api container build. For destructive schema changes use:

```bash
docker compose exec api pnpm --filter @xcrawl/db exec prisma migrate deploy
```

## 9. Backup

Two things to back up: the Postgres database and the storage volume.

```bash
# Postgres dump (run on the host)
docker compose exec -T postgres pg_dump -U xcrawl xcrawl \
  | gzip > xcrawl-$(date +%F).sql.gz

# Storage volume (scraped artifacts in local mode)
docker run --rm \
  -v xcrawl_storage-data:/data:ro \
  -v "$PWD":/backup alpine \
  tar czf "/backup/storage-$(date +%F).tar.gz" -C / data
```

To restore:

```bash
gunzip -c xcrawl-2026-05-30.sql.gz \
  | docker compose exec -T postgres psql -U xcrawl xcrawl

docker run --rm \
  -v xcrawl_storage-data:/data \
  -v "$PWD":/backup alpine \
  tar xzf /backup/storage-2026-05-30.tar.gz -C /
```

Schedule both via cron or your favorite backup tool. The `caddy-data`
volume (certificates) is also worth keeping — rebuilding it just re-issues
certs, which can hit Let's Encrypt rate limits.

## 10. Troubleshooting

**Caddy can't get a certificate.** DNS is the usual cause. Check
`dig $XCRAWL_DOMAIN` resolves to the server's public IP and ports 80 + 443
are reachable. Inspect Caddy logs: `docker compose logs caddy`.

**API container restarts.** Check `docker compose logs api`. Common causes:
missing `JWT_SECRET`, bad `DATABASE_URL`, or Postgres still starting (the
healthcheck should prevent this — if not, `docker compose restart api`).

**Workers idle.** Confirm `docker compose ps worker` shows two replicas
running and Redis is healthy. BullMQ queues are visible via:
```bash
docker compose exec redis redis-cli KEYS 'bull:*'
```

**Socket.IO doesn't connect.** Open browser devtools, look for
`/socket.io/` requests. They should hit `wss://$XCRAWL_DOMAIN/socket.io/...`.
If they're stuck on polling, check that nothing between the client and Caddy
strips the `Upgrade: websocket` header (some corporate proxies do).

**MCP returns 401.** The MCP endpoint requires `X-API-Key`. Create one in
the dashboard under **Settings → API keys**. Test:
```bash
curl -H "X-API-Key: xc_..." https://$XCRAWL_DOMAIN/mcp \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Out of memory during build.** Playwright's Chromium download is large.
Add swap or use a host with 4+ GB RAM. To skip the browser install (and
disable JS-rendering), edit `docker/Dockerfile.api` and remove the
`npx playwright install` line — the crawler falls back to Cheerio-only.

**Logs.** Everything goes to Docker:
```bash
docker compose logs -f api worker        # follow API + workers
docker compose logs --tail 200 caddy     # last 200 Caddy lines
docker compose logs --since 1h api       # last hour
```

For structured log analysis, point your log shipper at the JSON stream
(`docker compose logs api --no-color` writes pino's JSON output).
