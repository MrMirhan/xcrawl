<p align="center">
  <h1 align="center">XCrawl</h1>
  <p align="center">
    Open-source web crawling and scraping platform.<br/>
    Self-hosted, free forever, no limits.
  </p>
  <p align="center">
    <a href="https://github.com/MrMirhan/xcrawl/actions"><img src="https://github.com/MrMirhan/xcrawl/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/MrMirhan/xcrawl/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" /></a>
    <a href="https://github.com/MrMirhan/xcrawl/stargazers"><img src="https://img.shields.io/github/stars/MrMirhan/xcrawl" alt="Stars" /></a>
    <a href="https://xcrawl.space"><img src="https://img.shields.io/badge/website-xcrawl.space-blue" alt="Website" /></a>
  </p>
</p>

---

**XCrawl** turns any website into clean, structured data. Scrape single pages, crawl entire sites, extract structured data with AI, search the web — all from a single API or a beautiful dashboard.

> **No credits. No rate limits. No vendor lock-in.** Self-host it and own your data.

---

## Features

### Core API

- **Scrape** — Single URL to markdown, HTML, text, links, images, or screenshot
- **Crawl** — Recursive site crawl with depth limits, path regex filters, concurrency control
- **Batch** — Scrape hundreds of URLs concurrently with retry
- **Map** — Discover all URLs on a site (sitemap + link extraction)
- **Search** — Web search (self-hosted SearXNG if configured, DuckDuckGo otherwise) + full-page scraping of results
- **Extract** — AI-powered structured extraction with JSON schema or natural language prompt

### Crawler Engine

- **Smart engine selection** — Auto-picks Cheerio (fast) or Playwright (JS rendering)
- **JS auto-detection** — Retries with browser if static scraping returns empty content
- **Anti-blocking** — Stealth fingerprinting, user-agent rotation, session/proxy pool
- **Popup auto-dismiss** — Cookie banners, modals, GDPR dialogs handled automatically
- **Paywall detection** — Skip or flag paywalled pages
- **robots.txt** — Respects crawl rules and delay directives
- **Document parsing** — PDF and DOCX files extracted to markdown
- **URL rewriting** — Reddit, Medium, Twitter redirected to scrape-friendly mirrors
- **Archive fallback** — Wayback Machine used when all engines fail
- **Canonical dedup** — Avoids scraping the same page twice

### Dashboard

- **Playground** — 5 modes (Scrape, Crawl, Map, Search, Extract) with full settings
- **Live progress** — WebSocket-powered real-time crawl updates
- **Multi-format viewer** — Switch between Markdown, HTML, Text, Links, Images, JSON per result
- **Downloads** — Per-page or full ZIP export with folder structure
- **Schedules** — Cron-based recurring crawls with content change detection
- **10 extraction templates** — News, Product, Blog, Social Media, Job, Recipe, and more
- **Dark mode** — System-aware with manual toggle
- **Mobile responsive** — Collapsible sidebar, touch-friendly

### Multi-User

- **Auth** — Email/password signup with JWT
- **Admin approval** — Gate new signups behind admin review (`REGISTRATION_REQUIRE_APPROVAL`), or disable signup entirely (`DISABLE_REGISTRATION`); admins manage roles and enable/disable accounts from `/admin/users`
- **Plans & usage limits** — Admin-managed plans (`/admin/plans`) set daily/weekly caps per pool (pages, search, extract) with per-user overrides; BYOK LLM access is gated per plan too
- **Per-user LLM** — Bring your own API key (OpenAI, Anthropic, Ollama, OpenRouter)
- **Per-user proxies** — Personal proxy list with batch import and liveness testing
- **Per-user search** — Custom SearXNG instance URL
- **API keys** — Create, list (masked), and revoke

### MCP Integration

XCrawl ships an MCP server at `/mcp` (Streamable HTTP transport). Connect any MCP-compatible client — Claude Code, Claude Desktop, Cursor, Continue, Zed — directly to your self-hosted instance using an API key.

Seven tools are available: `scrape`, `crawl`, `map`, `search`, `extract`, `getJob`, `listJobs`. Sync tools return data inline; async tools (`crawl`, `extract`) return a job id you poll with `getJob`.

```bash
# Claude Code — one-liner setup
claude mcp add --transport http xcrawl http://localhost:3001/mcp \
  --header "X-API-Key: xc_your_key_here"
```

See [docs/mcp.md](docs/mcp.md) for full client setup (Claude Desktop, Cursor, others), the complete tool reference, and production deployment notes.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 11+
- [Docker](https://www.docker.com/) & Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/MrMirhan/xcrawl.git
cd xcrawl
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set the **required** values:

```env
JWT_SECRET=<generate with: openssl rand -hex 32>
ADMIN_PASSWORD=<choose a strong password>
```

### 3. Start infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

Starts PostgreSQL, Redis, and SearXNG.

### 4. Set up database

```bash
pnpm run db:push
pnpm run db:seed
```

### 5. Install Playwright browser

```bash
pnpm --filter @xcrawl/crawler exec playwright install chromium
```

### 6. Start development

```bash
pnpm run dev
```

| Service | URL |
|---------|-----|
| Dashboard | [http://localhost:3000](http://localhost:3000) |
| API | [http://localhost:3001](http://localhost:3001) |
| Swagger Docs | [http://localhost:3001/api/docs](http://localhost:3001/api/docs) |

Login with the email and password you set in `.env`.

---

## API Reference

All endpoints require authentication via `Authorization: Bearer <jwt>` or `X-API-Key: <key>`. Every request is rate-limited (Redis-backed sliding window, higher ceiling once authenticated), and scrape/crawl targets are checked against private and link-local IP ranges to block SSRF.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/scrape` | Scrape a single URL (sync) |
| `POST` | `/api/v1/crawl` | Start recursive crawl (async) |
| `GET` | `/api/v1/crawl/:id` | Poll crawl status and results |
| `DELETE` | `/api/v1/crawl/:id` | Cancel a running crawl |
| `POST` | `/api/v1/batch/scrape` | Batch scrape multiple URLs (async) |
| `GET` | `/api/v1/batch/scrape/:id` | Poll batch status and results |
| `POST` | `/api/v1/map` | Discover all URLs on a site |
| `POST` | `/api/v1/search` | Search the web + scrape results |
| `POST` | `/api/v1/extract` | AI-powered structured extraction (async) |
| `GET` | `/api/v1/extract/:id` | Poll extract status and results |
| `POST` | `/api/v1/user/signup` | Create account |
| `POST` | `/api/v1/user/signin` | Sign in and get JWT |
| `GET` | `/api/v1/user/settings` | Get per-user settings |
| `PATCH` | `/api/v1/user/settings` | Update LLM/proxy/search config |
| `POST` | `/api/v1/auth/keys` | Create an API key |
| `GET` | `/api/v1/auth/keys` | List API keys (masked) |
| `DELETE` | `/api/v1/auth/keys/:id` | Revoke an API key |
| `GET` | `/api/v1/jobs` | List all jobs |
| `GET` | `/api/v1/jobs/stats` | Dashboard statistics |
| `POST` | `/api/v1/schedules` | Create recurring schedule |
| `POST` | `/api/v1/webhooks` | Register a webhook |
| `POST` | `/api/v1/proxies` | Add a proxy to your pool |

Interactive docs at `/api/docs` (Swagger UI).

### Example: Scrape a URL

```bash
curl -X POST http://localhost:3001/api/v1/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "url": "https://example.com",
    "formats": ["markdown", "links", "images"]
  }'
```

### Example: Crawl a site

```bash
curl -X POST http://localhost:3001/api/v1/crawl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "url": "https://docs.example.com",
    "maxPages": 50,
    "formats": ["markdown"],
    "includePaths": ["/docs/.*"],
    "excludePaths": ["/blog/.*"]
  }'
```

---

## Architecture

```
xcrawl/
├── apps/
│   ├── api/              # NestJS 11 — REST API, WebSocket, BullMQ workers
│   └── web/              # Next.js 16 — Dashboard, Playground
├── packages/
│   ├── crawler/          # Crawlee engine (Cheerio + Playwright)
│   ├── shared/           # Shared types, constants, DTOs
│   └── db/               # Prisma schema, migrations, seed
├── docker/               # Dockerfiles, SearXNG config
├── docker-compose.yml    # Production deployment
└── docker-compose.dev.yml # Local development
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **API** | NestJS 11, BullMQ, Prisma 7, Passport JWT, Socket.IO |
| **Crawler** | Crawlee 3 (Cheerio + Playwright), Turndown, Readability, pdf-parse |
| **Dashboard** | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Lucide Icons |
| **Database** | PostgreSQL 17 |
| **Queue/Cache** | Redis 7, BullMQ |
| **Search** | SearXNG (self-hosted) |
| **Storage** | Local filesystem or Garage (S3-compatible) |
| **Auth** | JWT (Passport), bcrypt |
| **Build** | pnpm workspaces, Turborepo |

---

## Production Deployment

### Pre-built Docker images

Pre-built multi-arch images (amd64/arm64) are published to GHCR on every release:

```bash
docker pull ghcr.io/mrmirhan/xcrawl-api:latest
docker pull ghcr.io/mrmirhan/xcrawl-web:latest
```

Pin to a specific version instead of `latest` for production (e.g. `:1.2.0`). The web image reads `NEXT_PUBLIC_API_URL` from the environment at container start (not baked in at build time), so point it at wherever you're running the API.

```bash
cp .env.production.example .env   # fill in domain, secrets, admin
docker compose up -d --build
```

Everything runs behind one Caddy reverse proxy with automatic HTTPS — API, dashboard, MCP, Socket.IO all served from a single domain. Workers scale via `deploy.replicas`. Behind NAT or want Cloudflare's edge? A Cloudflare Tunnel service ships commented in `docker-compose.yml`.

Deploying with [Dokploy](https://dokploy.com/)? `docker-compose.dokploy.yml` runs the same stack from a git-based deploy — Dokploy builds every service from source (no image registry) and injects Cloudflare Tunnel credentials via a `cloudflared-init` sidecar instead of a mounted file.

Full walkthrough — VPS quick start, Cloudflare Tunnel setup, backups, updates, troubleshooting — in [docs/deployment.md](docs/deployment.md). MCP client setup in [docs/mcp.md](docs/mcp.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding guidelines, and PR process.

## Security

If you discover a security vulnerability, please report it privately instead of opening a public issue.

## License

**[AGPL-3.0](LICENSE)**

You can self-host and use XCrawl freely. All forks, derivative works, and services built on XCrawl must also be open-source under AGPL-3.0.

---

<p align="center">
  Built with Crawlee, NestJS, Next.js, and a lot of coffee.
</p>
