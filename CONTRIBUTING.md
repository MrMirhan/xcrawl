# Contributing to XCrawl

Thanks for your interest in contributing to XCrawl!

## Development Setup

1. Fork and clone the repo
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` and fill in required values (`JWT_SECRET`, `ADMIN_PASSWORD`)
4. Start infrastructure: `docker compose -f docker-compose.dev.yml up -d`
5. Push schema: `pnpm run db:push`
6. Seed database: `pnpm run db:seed`
7. Install Playwright: `pnpm --filter @xcrawl/crawler exec playwright install chromium`
8. Start dev: `pnpm run dev`

## Project Structure

- `apps/api/` — NestJS backend
- `apps/web/` — Next.js frontend
- `packages/crawler/` — Crawlee-based crawling engine
- `packages/shared/` — Shared types and constants
- `packages/db/` — Prisma schema and migrations

## Pull Requests

- Create a feature branch from `main`
- Keep PRs focused — one feature or fix per PR
- Ensure the project builds: `pnpm run build`
- Add or update tests when applicable
- Follow existing code style and patterns

## Releasing

Create a GitHub Release with a semver tag (`v1.2.0`, `v` prefix required). This automatically triggers two workflows:

- **Release Images** — builds and pushes multi-arch `ghcr.io/mrmirhan/xcrawl-api` and `xcrawl-web` images, tagged with the version, `major.minor`, and `latest`.
- **Changelog** — opens a PR adding the release's changes to `CHANGELOG.md`. Review and merge it after.

If the changelog PR needs regenerating, re-run the "Changelog" workflow manually from the Actions tab with the version as input.

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Node version)

## Security

If you find a security vulnerability, please email security@xcrawl.space instead of opening a public issue.
