/**
 * E2E tests for the scrape endpoint:
 *   POST /api/v1/scrape
 *
 * The ScrapeController uses ApiKeyGuard + ApiKeyRateLimitGuard.
 * Both guards are overridden so no real Redis or DB is needed.
 * ScrapeService itself is mocked so no BullMQ connection is required.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { ScrapeController } from '../src/modules/scrape/scrape.controller';
import { ScrapeService } from '../src/modules/scrape/scrape.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../src/common/guards/rate-limit.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-for-e2e-tests-minimum-32-chars';
const USER_ID = 'user-uuid-scrape-1';

// ---------------------------------------------------------------------------
// Guards that simulate an authenticated request (JWT path)
// ---------------------------------------------------------------------------

class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.userId = USER_ID;
    return true;
  }
}

class UnauthenticatedGuard implements CanActivate {
  canActivate(): boolean {
    return false; // always blocks
  }
}

class PassThroughRateLimitGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SCRAPE_RESULT = {
  markdown: '# Hello World',
  html: '<h1>Hello World</h1>',
  metadata: { title: 'Hello World', url: 'https://example.com' },
};

// ---------------------------------------------------------------------------
// Suite: authenticated requests (guard passes through)
// ---------------------------------------------------------------------------

describe('Scrape E2E — authenticated', () => {
  let app: INestApplication;
  let scrapeServiceMock: { scrape: jest.Mock };

  beforeAll(async () => {
    scrapeServiceMock = { scrape: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ScrapeController],
      providers: [
        { provide: ScrapeService, useValue: scrapeServiceMock },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useClass(AuthenticatedGuard)
      .overrideGuard(ApiKeyRateLimitGuard)
      .useClass(PassThroughRateLimitGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Valid requests
  // -------------------------------------------------------------------------

  it('POST /api/v1/scrape — returns success with scraped data for a valid URL', async () => {
    scrapeServiceMock.scrape.mockResolvedValue({ success: true, data: SCRAPE_RESULT });

    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: expect.objectContaining({ markdown: expect.any(String) }) });
    expect(scrapeServiceMock.scrape).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com' }),
      undefined,    // apiKeyId
      USER_ID,      // userId injected by guard
    );
  });

  it('POST /api/v1/scrape — passes optional formats parameter to service', async () => {
    scrapeServiceMock.scrape.mockResolvedValue({ success: true, data: SCRAPE_RESULT });

    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://example.com', formats: ['markdown', 'html'] });

    expect(res.status).toBe(201);
    expect(scrapeServiceMock.scrape).toHaveBeenCalledWith(
      expect.objectContaining({ formats: ['markdown', 'html'] }),
      undefined,
      USER_ID,
    );
  });

  it('POST /api/v1/scrape — creates a job and returns an enqueued response', async () => {
    scrapeServiceMock.scrape.mockResolvedValue({
      success: true,
      data: SCRAPE_RESULT,
      cached: false,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://news.example.com', onlyMainContent: true });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(scrapeServiceMock.scrape).toHaveBeenCalledTimes(1);
  });

  it('POST /api/v1/scrape — handles service error gracefully', async () => {
    scrapeServiceMock.scrape.mockResolvedValue({
      success: false,
      error: 'Page timed out',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://slow.example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: false, error: 'Page timed out' });
  });

  // -------------------------------------------------------------------------
  // Validation failures
  // -------------------------------------------------------------------------

  it('POST /api/v1/scrape — returns 400 when url is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ formats: ['markdown'] });

    expect(res.status).toBe(400);
    expect(scrapeServiceMock.scrape).not.toHaveBeenCalled();
  });

  it('POST /api/v1/scrape — returns 400 for a non-URL string', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'not-a-valid-url' });

    expect(res.status).toBe(400);
  });

  it('POST /api/v1/scrape — returns 400 for unknown body fields (forbidNonWhitelisted)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://example.com', unknownField: true });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Suite: unauthenticated requests (guard blocks)
// ---------------------------------------------------------------------------

describe('Scrape E2E — unauthenticated', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const scrapeServiceMock = { scrape: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ScrapeController],
      providers: [
        { provide: ScrapeService, useValue: scrapeServiceMock },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useClass(UnauthenticatedGuard)
      .overrideGuard(ApiKeyRateLimitGuard)
      .useClass(PassThroughRateLimitGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/scrape — returns 403 when the guard rejects the request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://example.com' });

    // NestJS returns 403 when canActivate returns false
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Suite: real ApiKeyGuard (no X-API-Key, no Bearer) — 401 path
// ---------------------------------------------------------------------------

describe('Scrape E2E — real ApiKeyGuard rejects missing auth', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const scrapeServiceMock = { scrape: jest.fn() };
    const prismaMock = {
      apiKey: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ScrapeController],
      providers: [
        { provide: ScrapeService, useValue: scrapeServiceMock },
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => (key === JWT_SECRET ? JWT_SECRET : def),
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              throw new Error(`Missing key: ${key}`);
            },
          },
        },
        { provide: PrismaService, useValue: prismaMock },
      ],
    })
      .overrideGuard(ApiKeyRateLimitGuard)
      .useClass(PassThroughRateLimitGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/scrape — returns 401 when no auth credentials are provided', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scrape')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(401);
  });
});
