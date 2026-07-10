/**
 * E2E tests for job endpoints:
 *   GET /api/v1/jobs
 *   GET /api/v1/jobs/stats
 *   GET /api/v1/jobs/:id
 *   GET /api/v1/jobs/:id/results
 *
 * Uses flat controller + mocked service approach to avoid transitive DI
 * from PrismaModule / BullMQ. ApiKeyGuard is included with its deps mocked
 * so the real JWT Bearer auth path is exercised.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { JobController } from '../src/modules/job/job.controller';
import { JobService } from '../src/modules/job/job.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-for-e2e-tests-minimum-32-chars';
const USER_ID = 'user-uuid-jobs-1';
const USER_EMAIL = 'bob@example.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date();

const SAMPLE_JOB = {
  id: 'job-uuid-1',
  type: 'SCRAPE',
  status: 'COMPLETED',
  url: 'https://example.com',
  resultCount: 1,
  error: null,
  startedAt: NOW,
  completedAt: NOW,
  createdAt: NOW,
  userId: USER_ID,
};

// Prisma mock — only apiKey methods needed by ApiKeyGuard; job/jobResult needed by JobService
function buildPrismaMock() {
  return {
    apiKey: {
      findMany: jest.fn().mockResolvedValue([]), // empty → JWT path taken by ApiKeyGuard
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: 'USER', isActive: true }), // ApiKeyGuard.enforceUserStatus
    },
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    jobResult: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Jobs E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  function makeJwt(userId = USER_ID, email = USER_EMAIL): string {
    return jwtService.sign({ sub: userId, email });
  }

  beforeAll(async () => {
    prisma = buildPrismaMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [JobController],
      providers: [
        // Real JobService backed by the prisma mock
        JobService,
        { provide: PrismaService, useValue: prisma },
        // ApiKeyGuard and its deps
        ApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => (key === 'JWT_SECRET' ? JWT_SECRET : def),
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              throw new Error(`Missing config key: ${key}`);
            },
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.apiKey.findMany.mockResolvedValue([]); // always take JWT path
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/jobs
  // -------------------------------------------------------------------------

  describe('GET /api/v1/jobs', () => {
    it('returns paginated jobs scoped to the authenticated user', async () => {
      prisma.job.findMany.mockResolvedValue([SAMPLE_JOB]);
      prisma.job.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: expect.arrayContaining([expect.objectContaining({ id: 'job-uuid-1' })]),
        pagination: expect.objectContaining({ page: 1, total: 1 }),
      });
    });

    it('supports page and limit query parameters', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(100);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs?page=3&limit=5')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({ page: 3, limit: 5, total: 100 });
    });

    it('supports filtering by status', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs?status=FAILED')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/jobs');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/jobs/stats
  // -------------------------------------------------------------------------

  describe('GET /api/v1/jobs/stats', () => {
    it('returns job statistics scoped to the user', async () => {
      // count is called 4 times: total, completed, failed, running
      prisma.job.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7)  // completed
        .mockResolvedValueOnce(2)  // failed
        .mockResolvedValueOnce(1); // running

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/stats')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        total: 10,
        completed: 7,
        failed: 2,
        running: 1,
        successRate: 70,
      });
    });

    it('returns successRate of 0 when total is 0', async () => {
      prisma.job.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/stats')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body.successRate).toBe(0);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/jobs/stats');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/jobs/:id
  // -------------------------------------------------------------------------

  describe('GET /api/v1/jobs/:id', () => {
    it('returns the job when owned by the requesting user', async () => {
      prisma.job.findFirst.mockResolvedValue({
        ...SAMPLE_JOB,
        results: [],
        _count: { results: 0 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/job-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'job-uuid-1' });
    });

    it('returns 404 when job belongs to a different user', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/other-users-job')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for a non-existent job id', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/does-not-exist')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/jobs/job-uuid-1');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/jobs/:id/results
  // -------------------------------------------------------------------------

  describe('GET /api/v1/jobs/:id/results', () => {
    it('returns paginated results for a job owned by the user', async () => {
      prisma.job.findFirst.mockResolvedValue(SAMPLE_JOB);
      prisma.jobResult.findMany.mockResolvedValue([
        { id: 'result-1', jobId: 'job-uuid-1', markdown: '# Title', createdAt: NOW },
      ]);
      prisma.jobResult.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/job-uuid-1/results')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: expect.arrayContaining([expect.objectContaining({ id: 'result-1' })]),
        pagination: expect.objectContaining({ total: 1 }),
      });
    });

    it('returns 404 when the job does not belong to the user', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/other-job-id/results')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(404);
    });

    it('respects page and limit query parameters', async () => {
      prisma.job.findFirst.mockResolvedValue(SAMPLE_JOB);
      prisma.jobResult.findMany.mockResolvedValue([]);
      prisma.jobResult.count.mockResolvedValue(50);

      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/job-uuid-1/results?page=2&limit=10')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({ page: 2, limit: 10, total: 50 });
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/jobs/job-uuid-1/results');
      expect(res.status).toBe(401);
    });
  });
});
