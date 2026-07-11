# Changelog

All notable changes to this project are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- User roles (`PENDING`/`USER`/`ADMIN`) with an admin approval workflow — `DISABLE_REGISTRATION` and `REGISTRATION_REQUIRE_APPROVAL` control signup behavior
- Admin user management at `/admin/users` — approve/reject pending signups, change roles, enable/disable accounts
- Plans & usage limits — admin-managed plans at `/admin/plans` with daily/weekly quotas per pool (pages, search, extract), per-user overrides, and per-plan BYOK gating
- Self-service usage visibility on `/settings` and `GET /user/usage`
- Pre-built multi-arch (amd64/arm64) Docker images published to GHCR on every release
- MCP server at `/mcp` (Streamable HTTP transport) with seven tools: `scrape`, `crawl`, `map`, `search`, `extract`, `getJob`, `listJobs`
- `SECURITY.md` and `CODE_OF_CONDUCT.md`

### Changed
- Node 20 → 24, pnpm 10 → 11 across CI and Docker images
- `LICENSE` now contains the complete AGPL-3.0 text (was previously a summary only)

### Fixed
- SSRF protection (`assertPublicUrl`) extended to every endpoint that accepts a user-supplied URL
- Redis-backed rate limiting extended to all protected controllers
- API key creation now retries on prefix collision instead of failing
- 43 high and 1 critical dependency vulnerabilities patched (0 remaining)
