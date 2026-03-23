/**
 * E2E tests for schedule CRUD:
 *   POST   /api/v1/schedules
 *   GET    /api/v1/schedules
 *   GET    /api/v1/schedules/:id
 *   PATCH  /api/v1/schedules/:id
 *   DELETE /api/v1/schedules/:id
 *
 * Uses flat controller + mocked service approach. ApiKeyGuard is included
 * with its deps mocked so the real JWT Bearer auth path is exercised.
 * ScheduleService is mocked to avoid BullMQ/Redis/DB connections.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { ScheduleController } from '../src/modules/schedule/schedule.controller';
import { ScheduleService } from '../src/modules/schedule/schedule.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-for-e2e-tests-minimum-32-chars';
const USER_ID = 'user-uuid-schedule-1';
const USER_EMAIL = 'scheduler@example.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date();
const NEXT_RUN = new Date(Date.now() + 3_600_000);

const SAMPLE_SCHEDULE = {
  id: 'schedule-uuid-1',
  name: 'Daily scrape',
  type: 'SCRAPE',
  cron: '0 9 * * *',
  config: { url: 'https://example.com' },
  active: true,
  enableChangeDetection: false,
  webhookUrl: null,
  userId: USER_ID,
  nextRunAt: NEXT_RUN,
  lastRunAt: null,
  lastJobId: null,
  runCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

function buildPrismaMock() {
  return {
    apiKey: {
      findMany: jest.fn().mockResolvedValue([]), // empty → JWT path taken by ApiKeyGuard
      update: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

function buildScheduleServiceMock() {
  return {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    toggle: jest.fn(),
    remove: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Schedules E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let scheduleService: ReturnType<typeof buildScheduleServiceMock>;
  let prisma: ReturnType<typeof buildPrismaMock>;

  function makeJwt(userId = USER_ID, email = USER_EMAIL): string {
    return jwtService.sign({ sub: userId, email });
  }

  beforeAll(async () => {
    prisma = buildPrismaMock();
    scheduleService = buildScheduleServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ScheduleController],
      providers: [
        { provide: ScheduleService, useValue: scheduleService },
        { provide: PrismaService, useValue: prisma },
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
  // POST /api/v1/schedules
  // -------------------------------------------------------------------------

  describe('POST /api/v1/schedules', () => {
    it('creates a schedule with a valid cron expression', async () => {
      scheduleService.create.mockResolvedValue(SAMPLE_SCHEDULE);

      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({
          name: 'Daily scrape',
          type: 'SCRAPE',
          cron: '0 9 * * *',
          config: { url: 'https://example.com' },
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'schedule-uuid-1', name: 'Daily scrape' });
      expect(scheduleService.create).toHaveBeenCalledWith(
        expect.objectContaining({ cron: '0 9 * * *', type: 'SCRAPE' }),
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('creates a schedule of type CRAWL', async () => {
      scheduleService.create.mockResolvedValue({ ...SAMPLE_SCHEDULE, type: 'CRAWL' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({
          name: 'Weekly crawl',
          type: 'CRAWL',
          cron: '0 0 * * 1',
          config: { url: 'https://example.com', maxPages: 100 },
        });

      expect(res.status).toBe(201);
    });

    it('returns 400 when the service rejects an invalid cron expression', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      scheduleService.create.mockRejectedValue(
        new BadRequestException('Invalid cron expression: not-a-cron'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({
          name: 'Bad schedule',
          type: 'SCRAPE',
          cron: 'not-a-cron',
          config: { url: 'https://example.com' },
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ name: 'Incomplete' }); // missing type, cron, config

      expect(res.status).toBe(400);
      expect(scheduleService.create).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid type value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({
          name: 'Bad type',
          type: 'INVALID_TYPE',
          cron: '0 9 * * *',
          config: { url: 'https://example.com' },
        });

      expect(res.status).toBe(400);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .send({
          name: 'My Schedule',
          type: 'SCRAPE',
          cron: '0 9 * * *',
          config: { url: 'https://example.com' },
        });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/schedules
  // -------------------------------------------------------------------------

  describe('GET /api/v1/schedules', () => {
    it("returns the user's schedules", async () => {
      scheduleService.list.mockResolvedValue([SAMPLE_SCHEDULE]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: 'schedule-uuid-1' });
      expect(scheduleService.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('returns an empty array when the user has no schedules', async () => {
      scheduleService.list.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/schedules');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/schedules/:id
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/schedules/:id', () => {
    it('updates a schedule owned by the user', async () => {
      const updated = { ...SAMPLE_SCHEDULE, name: 'Updated name', cron: '0 10 * * *' };
      scheduleService.update.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/schedules/schedule-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ name: 'Updated name', cron: '0 10 * * *' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Updated name', cron: '0 10 * * *' });
      expect(scheduleService.update).toHaveBeenCalledWith(
        'schedule-uuid-1',
        expect.objectContaining({ name: 'Updated name' }),
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('can deactivate a schedule', async () => {
      scheduleService.update.mockResolvedValue({ ...SAMPLE_SCHEDULE, active: false });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/schedules/schedule-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
    });

    it('returns 404 when the schedule belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      scheduleService.update.mockRejectedValue(new NotFoundException('Schedule not found'));

      const res = await request(app.getHttpServer())
        .patch('/api/v1/schedules/other-users-schedule')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ name: 'Attempt' });

      expect(res.status).toBe(404);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/schedules/schedule-uuid-1')
        .send({ name: 'New name' });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/schedules/:id
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/schedules/:id', () => {
    it('deletes a schedule owned by the user', async () => {
      scheduleService.remove.mockResolvedValue({ success: true });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/schedules/schedule-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
      expect(scheduleService.remove).toHaveBeenCalledWith(
        'schedule-uuid-1',
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('returns 404 when the schedule belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      scheduleService.remove.mockRejectedValue(new NotFoundException('Schedule not found'));

      const res = await request(app.getHttpServer())
        .delete('/api/v1/schedules/other-users-schedule')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).delete('/api/v1/schedules/schedule-uuid-1');
      expect(res.status).toBe(401);
    });
  });
});
