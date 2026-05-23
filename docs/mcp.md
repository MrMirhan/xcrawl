# XCrawl MCP Server

XCrawl exposes a [Model Context Protocol](https://modelcontextprotocol.io/) server at `/mcp`. Any MCP-compatible client can connect to it and call XCrawl's crawling, scraping, and search tools directly from a chat or coding session — without copy-pasting API calls.

The server uses the **Streamable HTTP transport** (MCP spec, 2025). Clients that only support SSE or stdio need a bridge (see [Other clients](#44-other-clients)).

Supported clients include: Claude Code, Claude Desktop, Cursor, Continue, Zed, and any other tool that speaks Streamable HTTP MCP.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Authentication](#3-authentication)
4. [Client setup](#4-client-setup)
   - [Claude Code](#41-claude-code)
   - [Claude Desktop](#42-claude-desktop)
   - [Cursor](#43-cursor)
   - [Other clients](#44-other-clients)
5. [Tool reference](#5-tool-reference)
6. [Usage examples](#6-usage-examples)
7. [Production deployment notes](#7-production-deployment-notes)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Overview

The MCP server wraps XCrawl's full API surface as MCP tools. Once connected, your AI assistant can scrape pages, crawl sites, search the web, and run LLM extractions without leaving the chat context.

Endpoint: `http://<host>:3001/mcp`

The path is excluded from the `/api/v1` global prefix — it is `/mcp`, not `/api/v1/mcp`.

Sessions are stateful per connection. The server sweeps idle sessions after 30 minutes.

---

## 2. Prerequisites

- A running XCrawl API instance (self-hosted or local dev). See the [Quick Start](../README.md#quick-start) in the main README.
- An API key with the `xc_` prefix. Create one from the dashboard under Settings → API Keys, or via `POST /api/v1/user/api-keys`.

For local development the API runs on `http://localhost:3001`.

---

## 3. Authentication

Every request to `/mcp` must carry one of:

`X-API-Key: xc_your_key_here` (recommended)

Or:

`Authorization: Bearer <jwt>` — the token returned from `POST /api/v1/user/signin`.

The API key approach works better for MCP clients because the key is long-lived. JWT tokens expire and require re-authentication.

The guard checks `X-API-Key` first, then `Authorization`. You only need one.

---

## 4. Client setup

### 4.1 Claude Code

Add the server with the CLI:

```bash
claude mcp add --transport http xcrawl http://your-xcrawl.example.com/mcp \
  --header "X-API-Key: xc_your_key_here"
```

For local development:

```bash
claude mcp add --transport http xcrawl http://localhost:3001/mcp \
  --header "X-API-Key: xc_your_key_here"
```

Or add it manually to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "xcrawl": {
      "type": "http",
      "url": "http://your-xcrawl.example.com/mcp",
      "headers": {
        "X-API-Key": "xc_your_key_here"
      }
    }
  }
}
```

Verify the connection:

```bash
claude mcp list
```

You should see `xcrawl` listed as connected.

---

### 4.2 Claude Desktop

Config file locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the `xcrawl` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "xcrawl": {
      "url": "http://your-xcrawl.example.com/mcp",
      "headers": {
        "X-API-Key": "xc_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config.

**Note on older versions:** Claude Desktop versions prior to May 2025 may only support stdio transport. If you're on an older version and the connection fails, use [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) to bridge stdio to HTTP:

```bash
npx mcp-proxy --port 3100 http://your-xcrawl.example.com/mcp \
  --header "X-API-Key: xc_your_key_here"
```

Then point Claude Desktop at the stdio proxy instead.

---

### 4.3 Cursor

Workspace config (`.cursor/mcp.json` in your project root) or global config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "xcrawl": {
      "url": "http://your-xcrawl.example.com/mcp",
      "headers": {
        "X-API-Key": "xc_your_key_here"
      }
    }
  }
}
```

Reload the Cursor window after saving.

---

### 4.4 Other clients

Generic Streamable HTTP MCP config shape:

```json
{
  "transport": "http",
  "url": "http://your-xcrawl.example.com/mcp",
  "headers": {
    "X-API-Key": "xc_your_key_here"
  }
}
```

If your client only supports SSE or stdio, run `mcp-proxy` as a bridge:

```bash
npx mcp-proxy --port 3100 http://your-xcrawl.example.com/mcp \
  --header "X-API-Key: xc_your_key_here"
```

Then configure your client to connect to `http://localhost:3100` via its supported transport.

---

## 5. Tool reference

| Tool | Mode | Description | Input parameters |
|------|------|-------------|-----------------|
| `scrape` | sync | Fetch a single URL and return its content | `url` (string, required), `formats` (array of `markdown`\|`html`\|`links`\|`rawHtml`\|`screenshot`, optional), `onlyMainContent` (boolean, optional), `timeout` (integer ms, optional) |
| `crawl` | async | Recursively crawl a site starting from a URL | `url` (string, required), `maxPages` (integer, optional), `maxDepth` (integer ≥ 0, optional), `includePaths` (string[], optional), `excludePaths` (string[], optional), `formats` (string[], optional), `onlyMainContent` (boolean, optional), `allowExternalLinks` (boolean, optional), `allowSubdomains` (boolean, optional) |
| `map` | sync | Discover all URLs reachable from a starting URL | `url` (string, required), `search` (string filter, optional), `limit` (integer, optional), `includeSitemap` (boolean, optional) |
| `search` | sync | Run a web search and scrape the top results | `query` (string, required), `limit` (integer, optional), `formats` (string[], optional) |
| `extract` | async | LLM extraction over a list of URLs | `urls` (string[], min 1, required), `schema` (JSON schema object, optional), `prompt` (string, optional) |
| `getJob` | sync | Fetch status and results of an async job | `id` (string, required) |
| `listJobs` | sync | List jobs with optional filters | `page` (integer, optional), `limit` (integer max 100, optional), `type` (`SCRAPE`\|`CRAWL`\|`BATCH_SCRAPE`\|`MAP`\|`EXTRACT`, optional), `status` (`PENDING`\|`RUNNING`\|`COMPLETED`\|`FAILED`\|`CANCELLED`\|`PARTIAL`, optional) |

Async tools (`crawl`, `extract`) return `{ success: true, id: "<job-id>" }` immediately. Poll with `getJob` until `status` is `COMPLETED` or `FAILED`.

The `search` tool uses the SearXNG URL from your user settings if configured, otherwise falls back to DuckDuckGo.

The `extract` tool requires your user account to have an LLM provider configured (Settings → LLM).

---

## 6. Usage examples

### Scraping a page

In Claude Code or Claude Desktop chat:

> Scrape https://example.com and give me a summary.

Claude calls:

```json
xcrawl/scrape({ "url": "https://example.com" })
```

Returns markdown content inline. Claude summarizes it in the same turn.

---

### Crawling a docs site

> Crawl the docs at https://docs.example.com, limit to 50 pages, only paths under /guide/.

Claude calls:

```json
xcrawl/crawl({
  "url": "https://docs.example.com",
  "maxPages": 50,
  "includePaths": ["/guide/.*"]
})
```

Returns `{ "success": true, "id": "cm..." }`. Claude then polls:

```json
xcrawl/getJob({ "id": "cm..." })
```

Until `status` is `COMPLETED`, then works with the results.

---

### Structured extraction

> Extract the product name, price, and availability from these three URLs.

Claude calls:

```json
xcrawl/extract({
  "urls": [
    "https://shop.example.com/product/a",
    "https://shop.example.com/product/b",
    "https://shop.example.com/product/c"
  ],
  "schema": {
    "name": "string",
    "price": "number",
    "available": "boolean"
  }
})
```

Returns a job id. Claude polls `getJob` and presents the structured results when complete.

---

### URL discovery

> What pages are available under https://docs.example.com?

Claude calls:

```json
xcrawl/map({ "url": "https://docs.example.com" })
```

Returns a list of discovered URLs synchronously.

---

## 7. Production deployment notes

**TLS.** Run the API behind a reverse proxy with TLS (nginx, Caddy, Traefik). API keys travel in headers — they must not cross the network in plaintext.

**Reverse proxy path routing.** Forward `/mcp` to the API. Example nginx snippet:

```nginx
location /mcp {
    proxy_pass http://api:3001/mcp;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}
```

Set `proxy_read_timeout` high enough for long crawls.

**Rate limiting.** The `/mcp` path is excluded from the global prefix and does not automatically inherit any rate-limit guards applied to `/api/v1/*`. If you want to rate-limit MCP access, add `ApiKeyRateLimitGuard` to `McpController` in `apps/api/src/modules/mcp/mcp.controller.ts`.

**Network exposure.** If `/mcp` is public, any valid API key can run crawls. Consider placing the MCP endpoint behind a VPN or IP allowlist if you are the only user.

**API key rotation.** Rotate keys periodically from the dashboard. Old keys can be revoked without affecting other keys linked to the same account.

---

## 8. Troubleshooting

**Connection refused**

Check that the XCrawl API is running and the port is correct. Default is `3001`. Run `curl http://localhost:3001/mcp` — you should get a 400 (missing session), not a connection error.

**401 Unauthorized**

The API key is invalid, revoked, or the header name is wrong. The header must be exactly `X-API-Key` (case-insensitive in HTTP, but match what your client sends). Verify the key value starts with `xc_`.

**404 Not Found**

The path must be `/mcp`, not `/api/v1/mcp`. The MCP controller is explicitly excluded from the global prefix.

**"Bad Request: missing or unknown session id"**

This is the normal response when a client POSTs to `/mcp` without starting a session first. It means the endpoint is reachable. Your MCP client should handle session initialization automatically via the `initialize` request.

**Session not found after reconnect**

Sessions live in memory and are scoped to an API process. If the API restarts, all sessions are cleared. MCP clients that cache `mcp-session-id` across restarts will get a 404 — they need to re-initialize. Most clients do this automatically on reconnect.

**Tool call times out**

Async tools (`crawl`, `extract`) return a job id immediately — they do not block. If you called `scrape` on a very slow page, increase the `timeout` parameter (value in milliseconds). For crawls, the tool returns before crawling is finished; poll with `getJob`.

**extract tool returns an error about LLM**

The `extract` tool requires a configured LLM provider on your user account. Go to Settings → LLM in the dashboard and add your provider and API key.
