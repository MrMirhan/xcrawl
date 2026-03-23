# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XCrawl is a self-hosted, open-source web crawling/scraping platform (AGPL-3.0). Monorepo managed by pnpm workspaces + Turborepo.

**Tech stack:** NestJS 11 (API), Next.js 16 (dashboard), Crawlee 3 (crawler engine), Prisma 7 (ORM), PostgreSQL 17, Redis 7, BullMQ (job queues), Socket.IO (realtime), Tailwind CSS v4, shadcn-style components.

## Commands

```bash
# Development (starts all 5 packages in parallel watch mode, loads .env via dotenv-cli)
pnpm run dev

# Build (topological: packages first, then apps)
pnpm run build

# Database
pnpm run db:generate      # Generate Prisma client to packages/db/src/generated/prisma/
pnpm run db:push          # Push schema to DB without migration (dev)
pnpm run db:migrate       # Create + apply SQL migration (production)
pnpm run db:seed          # Create admin user (needs ADMIN_EMAIL + ADMIN_PASSWORD in .env)

# Single package build/test
pnpm --filter @xcrawl/api build      # nest build
pnpm --filter @xcrawl/web build      # next build
pnpm --filter @xcrawl/db build       # tsc
pnpm --filter @xcrawl/api test       # Jest unit tests
pnpm --filter @xcrawl/api test:e2e   # Jest e2e tests

# Infrastructure
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL 17, Redis 7, SearXNG
```

After Prisma schema changes: `pnpm run db:generate` then `pnpm run db:push` (dev) or `pnpm run db:migrate` (prod).

## Monorepo Structure

```
apps/api        @xcrawl/api      NestJS 11 REST API (port 3001), global prefix /api/v1
apps/web        @xcrawl/web      Next.js 16 dashboard (port 3000), App Router, Turbopack
packages/crawler @xcrawl/crawler  Standalone crawling engine (Crawlee + Playwright)
packages/db     @xcrawl/db       Prisma 7 schema, generated client, seed script
packages/shared @xcrawl/shared   Cross-package TypeScript types and constants
```

### Dependency Flow (strictly one-directional)

```
apps/web  → @xcrawl/shared
apps/api  → @xcrawl/crawler, @xcrawl/db, @xcrawl/shared
packages/* have zero workspace dependencies
```

## Architecture

### API (NestJS)

18 feature modules in `apps/api/src/modules/`. Each module owns its controller, service, DTO, and BullMQ processor (if async). Infrastructure modules (Prisma, CrawlerEngine, Storage, Cache, Gateway) are shared singletons.

**Route structure:** All endpoints under `/api/v1`. Swagger docs at `/api/docs`.

**Sync endpoints:** `/scrape`, `/map`, `/search` — return result directly.
**Async endpoints:** `/crawl`, `/batch/scrape`, `/extract` — return job ID, poll for status.

**Auth:** Dual-strategy via `ApiKeyGuard`. JWT Bearer (from `/user/signin`) OR `X-API-Key` header. Guard sets `req.userId` and optionally `req.apiKeyId`. `UserAuthModule` is `@Global()`.

**Job queue:** BullMQ backed by Redis. Queues defined as constants in `@xcrawl/shared`: `scrape`, `crawl`, `batch-scrape`, `extract`, `webhook-delivery`. Socket.IO gateway emits real-time crawl progress.

### Crawler Engine

`CrawlerEngine` class in `packages/crawler/src/engine.ts` with `scrape()`, `crawl()`, `map()`.

**Auto-engine selection:** Cheerio (fast) → Playwright (if JS-rendered) → Wayback Machine (fallback). Each operation uses isolated Crawlee storage via unique temp dirs (`crypto.randomBytes`).

**Anti-blocking:** Stealth fingerprinting, proxy rotation, session management, popup auto-dismiss, paywall detection, URL rewriting (Reddit→old.reddit, Twitter→Nitter, Medium→Scribe).

### Per-User Settings

LLM config (provider, model, apiKey, baseUrl), proxy URLs, and SearXNG URL are stored per-user in `UserSettings` table — NOT env vars. Services load from DB at request time with fallback chain: explicit params → user settings → env vars → defaults.

### Database

Prisma 7 with `prisma-client` generator, output to `packages/db/src/generated/prisma/`. Config in `packages/db/prisma.config.ts`. Uses `@prisma/adapter-pg` (direct TCP, no engine binary).

9 models: User, UserSettings, ApiKey, Job, JobResult, WebhookConfig, WebhookDelivery, ProxyConfig, Schedule.

Enums: `JobType` (SCRAPE/CRAWL/BATCH_SCRAPE/MAP/EXTRACT), `JobStatus` (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/PARTIAL).

### Frontend (Next.js)

App Router with `'use client'` pages. Centralized API client in `lib/api-client.ts` that auto-attaches JWT from localStorage. Auth state in localStorage keys: `xcrawl-token`, `xcrawl-user`, `xcrawl-api-key`. Theme via React context with localStorage persistence (`xcrawl-theme`).

## Environment

`JWT_SECRET` and `ADMIN_PASSWORD` are required with no defaults. All variables documented in `.env.example`. Root `pnpm run dev` uses `dotenv-cli` to load `.env` for all workspaces.

### TypeScript Config

Base (`tsconfig.base.json`): `strict: true`, `ES2022`, `NodeNext`, composite project references.
API overrides: `module: commonjs` (NestJS requirement).
DB overrides: `module: commonjs` (Prisma v7 generated TS must compile to CJS).

---

## Coding Patterns & Rules

Follow these patterns to maintain consistency across the codebase.

### NestJS Module Pattern

Every feature module follows this structure:
```
modules/<feature>/
  <feature>.module.ts       # Module definition
  <feature>.controller.ts   # Route handler
  <feature>.service.ts      # Business logic
  <feature>.processor.ts    # BullMQ worker (if async)
  dto/
    <feature>-request.dto.ts  # Input validation
```

### Service Pattern

```typescript
@Injectable()
export class FeatureService {
  private readonly logger = new Logger(FeatureService.name);

  constructor(
    @InjectQueue(QUEUES.FEATURE) private featureQueue: Queue,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}
}
```

- Logger always initialized with `new Logger(ClassName.name)`.
- Use `private readonly` for injected dependencies.
- Queue injection: `@InjectQueue(QUEUES.NAME)` with constants from `@xcrawl/shared`.

### Controller Pattern

```typescript
@ApiTags('Feature')
@Controller('feature')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class FeatureController {
  constructor(private featureService: FeatureService) {}

  @Post()
  async create(@Body() dto: FeatureRequestDto, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.featureService.create(dto, req.apiKeyId, req.userId);
  }
}
```

- Always use `@ApiTags` for Swagger grouping.
- Protected routes use `@UseGuards(ApiKeyGuard)`.
- Extract `apiKeyId` and `userId` from `@Req()`.
- Controllers are thin — delegate all logic to services.

### DTO Pattern

```typescript
export class FeatureRequestDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: string[];

  @IsOptional()
  @IsNumber()
  timeout?: number;
}
```

- Class names: `*RequestDto` / `*ResponseDto`.
- All validators from `class-validator`.
- Optional fields: `@IsOptional()` ABOVE the type validator.
- Arrays of strings: `@IsArray()` + `@IsString({ each: true })`.
- Nested objects: `@ValidateNested({ each: true })` + `@Type(() => NestedDto)`.
- JSDoc comments for non-obvious fields.

### BullMQ Processor Pattern

```typescript
@Processor(QUEUES.FEATURE)
export class FeatureProcessor extends WorkerHost {
  private readonly logger = new Logger(FeatureProcessor.name);

  async process(job: Job): Promise<void> {
    const { jobId, ...options } = job.data;

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      // Process...
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date(), error: errorMsg },
      });
      throw error;
    }
  }
}
```

- Extends `WorkerHost`, decorated with `@Processor(QUEUES.NAME)`.
- Destructure `job.data` with `{ jobId, ...rest }`.
- Job lifecycle: PENDING → RUNNING → COMPLETED/FAILED.
- Always update DB status on both success and failure.
- Error message extraction: `error instanceof Error ? error.message : 'Unknown error'`.

### Response Patterns

```typescript
// Success with data
return { success: true, data: result };

// Success with ID (async job created)
return { success: true, id: job.id };

// Failure
return { success: false, error: 'Error message' };

// List with pagination
return {
  data: results,
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
};

// Status response (async job)
return {
  id: job.id,
  status: job.status,
  progress: { completed, total, currentUrl },
  data: job.results,
};
```

### Error Handling

- NestJS exceptions for HTTP errors: `NotFoundException`, `UnauthorizedException`, `ConflictException`.
- Service-level try/catch returns `{ success: false, error }` — does NOT throw.
- Processor-level: updates DB with FAILED status, then re-throws.
- Error message extraction: `error instanceof Error ? error.message : 'Fallback message'`.

### Logging

```typescript
private readonly logger = new Logger(ClassName.name);

this.logger.log(`Processing job ${jobId} for ${url}`);      // Info
this.logger.debug(`Cache hit for ${url}`);                    // Debug
this.logger.warn(`Retrying ${url}: ${error.message}`);        // Warning
this.logger.error(`Job ${jobId} failed: ${errorMsg}`);        // Error
```

### Prisma Query Patterns

```typescript
// Create
await this.prisma.job.create({ data: { type: 'SCRAPE', url: dto.url, config: dto as object } });

// Find with relations
await this.prisma.job.findUnique({
  where: { id },
  include: {
    results: { select: { url: true, markdown: true }, take: 10, orderBy: { createdAt: 'desc' } },
    _count: { select: { results: true } },
  },
});

// Paginated list
const [results, total] = await Promise.all([
  this.prisma.jobResult.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'asc' } }),
  this.prisma.jobResult.count({ where }),
]);

// Atomic increment
await this.prisma.job.update({ where: { id }, data: { resultCount: { increment: 1 } } });

// JSON fields: cast with `as object`
data: { config: dto as object, metadata: result.metadata as object }
```

### Config Access

```typescript
// With default
const url = this.config.get('redis.url', 'redis://localhost:6379');

// Required (throws if missing)
const secret = this.config.getOrThrow('JWT_SECRET');

// Parsing
const port = parseInt(this.config.get('API_PORT', '3001'), 10);
```

Config registered via `registerAs()` in `apps/api/src/config/app.config.ts` with typed slices: `app`, `redis`, `database`, `crawler`, `storage`.

### Constants

Defined in `packages/shared/src/constants/defaults.ts`:
```typescript
export const QUEUES = { SCRAPE: 'scrape', CRAWL: 'crawl', ... } as const;
export const DEFAULTS = { SCRAPE_TIMEOUT: 30_000, CRAWL_MAX_PAGES: 100, ... } as const;
```

- Use `as const` for type narrowing.
- Numeric literals with underscores: `30_000`, `120_000`.
- Import from `@xcrawl/shared`.

### Frontend Page Pattern

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

export default function FeaturePage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    apiClient.listFeature(apiKey).then(setData).catch(console.error).finally(() => setLoading(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature</h1>
        <p className="text-muted-foreground mt-1">Description.</p>
      </div>
      {/* Content */}
    </div>
  );
}
```

- `'use client'` at top.
- Imports from `@/components/ui/*` (shadcn-style).
- API calls via `apiClient` from `@/lib/api-client`.
- Page wrapper: `<div className="space-y-6">` with h1 + subtitle.
- State: `useState` + `useEffect` for data fetching.

### UI Component Pattern (shadcn)

```typescript
const Component = React.forwardRef<HTMLElement, ComponentProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <element className={cn(baseClasses, variantClasses[variant], className)} ref={ref} {...props} />
  ),
);
Component.displayName = 'Component';
```

- `React.forwardRef` for DOM access.
- `cn()` utility (clsx + tailwind-merge) for class composition.
- Variant/size props with defaults.
- Always set `displayName`.
- Composed subcomponents: `Card`, `CardHeader`, `CardTitle`, `CardContent`.

### Null Coalescing & Defaults

```typescript
const formats = dto.formats ?? ['markdown'];
const timeout = options.timeout ?? 30_000;
const provider = userSettings?.llmProvider ?? this.config.get('LLM_PROVIDER', 'openai');
```

Always use `??` (nullish coalescing), never `||` for defaults (avoids falsy gotchas).

### Type Import Pattern

Use `import type` for type-only imports from other packages:
```typescript
import type { ScrapeOutput } from '@xcrawl/crawler';
```

Regular imports for values:
```typescript
import { QUEUES, DEFAULTS } from '@xcrawl/shared';
import { JobStatus } from '@xcrawl/db';
```

### Timeout Patterns

```typescript
// AbortSignal for fetch timeouts
signal: AbortSignal.timeout(120_000)

// BullMQ wait timeout (sync scrape)
const waitTimeout = hasExtract ? baseTimeout + 120_000 : baseTimeout + 10_000;
await bullJob.waitUntilFinished(this.queueEvents, waitTimeout);
```

### Request Type Augmentation

Guards set properties on the request object. Access them with inline types:
```typescript
@Req() req: { apiKeyId?: string; userId?: string }
```

### Job Processing Phases

For operations with LLM extraction, use two-phase processing to avoid Crawlee requestHandler timeouts:
1. **Phase 1:** Crawl/scrape all pages (fast, no LLM).
2. **Phase 2:** Run LLM extraction on saved results (no time pressure).

### Webhook Signature

HMAC-SHA256 with webhook secret, sent as `X-XCrawl-Signature` header:
```typescript
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
```

### API Key Format

Keys prefixed with `xc_` followed by 48 hex chars:
```typescript
const key = `xc_${crypto.randomBytes(24).toString('hex')}`;
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/app.module.ts` | Root NestJS module, wires all 18 feature modules |
| `apps/api/src/common/guards/api-key.guard.ts` | Dual auth guard (JWT + API key) |
| `apps/api/src/config/app.config.ts` | Typed config slices for `@nestjs/config` |
| `packages/crawler/src/engine.ts` | Core crawling engine with auto-engine selection |
| `packages/crawler/src/types.ts` | Engine option types |
| `packages/db/prisma/schema.prisma` | Database schema (9 models) |
| `packages/db/prisma.config.ts` | Prisma CLI config (datasource URL via dotenv) |
| `packages/db/src/index.ts` | Re-exports PrismaClient + PrismaPg adapter |
| `packages/shared/src/constants/defaults.ts` | Queue names, default timeouts, limits |
| `apps/web/src/lib/api-client.ts` | Frontend HTTP client, auto-attaches JWT |
| `apps/web/src/lib/auth.ts` | Token storage/retrieval helpers |

## Docker

- `docker-compose.dev.yml` — Dev infrastructure only (postgres, redis, searxng)
- `docker-compose.yml` — Full production stack (api, worker x2, web, postgres, redis, searxng, garage)
