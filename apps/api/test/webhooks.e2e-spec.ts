/**
 * E2E tests for webhook CRUD:
 *   POST   /api/v1/webhooks
 *   GET    /api/v1/webhooks
 *   PATCH  /api/v1/webhooks/:id
 *   DELETE /api/v1/webhooks/:id
 *
 * Uses flat controller + mocked service approach. ApiKeyGuard is included
 * with its deps mocked so the real JWT Bearer auth path is exercised.
 * WebhookService is mocked to avoid real DB / HTTP calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { WebhookController } from '../src/modules/webhook/webhook.controller';
import { WebhookService } from '../src/modules/webhook/webhook.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ApiKeyGuard } from '../src/common/guards/api-key.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-for-e2e-tests-minimum-32-chars';
const USER_ID = 'user-uuid-webhook-1';
const USER_EMAIL = 'webhooks@example.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date();

const SAMPLE_WEBHOOK = {
  id: 'webhook-uuid-1',
  url: 'https://hooks.example.com/callback',
  events: ['job.completed'],
  secret: null,
  active: true,
  userId: USER_ID,
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

function buildWebhookServiceMock() {
  return {
    createWebhook: jest.fn(),
    listWebhooks: jest.fn(),
    updateWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
    fireEvent: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Webhooks E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let webhookService: ReturnType<typeof buildWebhookServiceMock>;
  let prisma: ReturnType<typeof buildPrismaMock>;

  function makeJwt(userId = USER_ID, email = USER_EMAIL): string {
    return jwtService.sign({ sub: userId, email });
  }

  beforeAll(async () => {
    prisma = buildPrismaMock();
    webhookService = buildWebhookServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: webhookService },
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
  // POST /api/v1/webhooks
  // -------------------------------------------------------------------------

  describe('POST /api/v1/webhooks', () => {
    it('creates a webhook and scopes it to the authenticated user', async () => {
      webhookService.createWebhook.mockResolvedValue(SAMPLE_WEBHOOK);

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ url: 'https://hooks.example.com/callback', events: ['job.completed'] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'webhook-uuid-1', url: SAMPLE_WEBHOOK.url });
      expect(webhookService.createWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ url: SAMPLE_WEBHOOK.url, events: ['job.completed'] }),
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('creates a webhook with an optional secret', async () => {
      webhookService.createWebhook.mockResolvedValue({ ...SAMPLE_WEBHOOK, secret: 'mysecret' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({
          url: 'https://hooks.example.com/secure',
          events: ['job.completed', 'job.failed'],
          secret: 'mysecret',
        });

      expect(res.status).toBe(201);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks')
        .send({ url: 'https://hooks.example.com/callback', events: ['job.completed'] });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/webhooks
  // -------------------------------------------------------------------------

  describe('GET /api/v1/webhooks', () => {
    it('returns only the webhooks belonging to the authenticated user', async () => {
      webhookService.listWebhooks.mockResolvedValue([SAMPLE_WEBHOOK]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: 'webhook-uuid-1' });
      expect(webhookService.listWebhooks).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('returns an empty array when the user has no webhooks', async () => {
      webhookService.listWebhooks.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/webhooks');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/webhooks/:id
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/webhooks/:id', () => {
    it('updates a webhook owned by the user', async () => {
      const updated = { ...SAMPLE_WEBHOOK, url: 'https://hooks.example.com/new-path' };
      webhookService.updateWebhook.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/webhooks/webhook-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ url: 'https://hooks.example.com/new-path' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ url: 'https://hooks.example.com/new-path' });
      expect(webhookService.updateWebhook).toHaveBeenCalledWith(
        'webhook-uuid-1',
        expect.objectContaining({ url: 'https://hooks.example.com/new-path' }),
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('can toggle the active state of a webhook', async () => {
      webhookService.updateWebhook.mockResolvedValue({ ...SAMPLE_WEBHOOK, active: false });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/webhooks/webhook-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
    });

    it('returns 404 when the webhook belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      webhookService.updateWebhook.mockRejectedValue(new NotFoundException('Webhook not found'));

      const res = await request(app.getHttpServer())
        .patch('/api/v1/webhooks/other-users-webhook')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ url: 'https://hooks.example.com/attempt' });

      expect(res.status).toBe(404);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/webhooks/webhook-uuid-1')
        .send({ url: 'https://hooks.example.com/callback' });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/webhooks/:id
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('soft-deletes a webhook owned by the user', async () => {
      webhookService.deleteWebhook.mockResolvedValue({ success: true });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/webhooks/webhook-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
      expect(webhookService.deleteWebhook).toHaveBeenCalledWith(
        'webhook-uuid-1',
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it('returns 404 when the webhook belongs to another user', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      webhookService.deleteWebhook.mockRejectedValue(new NotFoundException('Webhook not found'));

      const res = await request(app.getHttpServer())
        .delete('/api/v1/webhooks/other-users-webhook')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).delete('/api/v1/webhooks/webhook-uuid-1');
      expect(res.status).toBe(401);
    });
  });
});
