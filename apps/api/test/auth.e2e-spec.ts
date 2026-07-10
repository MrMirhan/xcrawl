/**
 * E2E tests for auth flows:
 *   POST /api/v1/user/signup
 *   POST /api/v1/user/signin
 *   GET  /api/v1/user/profile
 *   POST /api/v1/auth/keys
 *   GET  /api/v1/auth/keys
 *   DELETE /api/v1/auth/keys/:id
 *
 * Uses flat controller + mocked-provider approach so no transitive DI
 * from PrismaModule / BullMQ is needed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UserAuthController } from '../src/modules/user-auth/user-auth.controller';
import { UserAuthService } from '../src/modules/user-auth/user-auth.service';
import { JwtStrategy } from '../src/modules/user-auth/jwt.strategy';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { UsageService } from '../src/modules/usage/usage.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-for-e2e-tests-minimum-32-chars';
const USER_ID = 'user-uuid-1';
const USER_EMAIL = 'alice@example.com';
const USER_PASSWORD = 'password123';

// bcrypt hash of "password123" (pre-computed, rounds=10)
const HASHED_PASSWORD =
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

function buildUserAuthServiceMock() {
  return {
    signup: jest.fn(),
    signin: jest.fn(),
    getProfile: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    testLlmConnection: jest.fn(),
  };
}

function buildAuthServiceMock() {
  return {
    createApiKey: jest.fn(),
    listApiKeys: jest.fn(),
    revokeApiKey: jest.fn(),
  };
}

function buildUsageServiceMock() {
  return {
    getUsage: jest.fn(),
  };
}

// Minimal PrismaService mock — only user.findUnique is needed, by JwtStrategy.validate()
function buildPrismaMock() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: 'USER', isActive: true }),
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Auth E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userAuthService: ReturnType<typeof buildUserAuthServiceMock>;
  let authService: ReturnType<typeof buildAuthServiceMock>;

  beforeAll(async () => {
    userAuthService = buildUserAuthServiceMock();
    authService = buildAuthServiceMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '7d' } }),
      ],
      controllers: [UserAuthController, AuthController],
      providers: [
        { provide: UserAuthService, useValue: userAuthService },
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: buildPrismaMock() },
        { provide: UsageService, useValue: buildUsageServiceMock() },
        JwtStrategy,
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
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function makeJwt(userId = USER_ID, email = USER_EMAIL): string {
    return jwtService.sign({ sub: userId, email });
  }

  // -------------------------------------------------------------------------
  // POST /api/v1/user/signup
  // -------------------------------------------------------------------------

  describe('POST /api/v1/user/signup', () => {
    it('creates a new user and returns a JWT', async () => {
      userAuthService.signup.mockResolvedValue({
        user: { id: USER_ID, email: USER_EMAIL, name: 'Alice' },
        token: 'signed-token',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signup')
        .send({ email: USER_EMAIL, password: USER_PASSWORD, name: 'Alice' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        user: { id: USER_ID, email: USER_EMAIL },
        token: expect.any(String),
      });
      expect(userAuthService.signup).toHaveBeenCalledTimes(1);
    });

    it('returns 409 when signup service throws ConflictException', async () => {
      const { ConflictException } = await import('@nestjs/common');
      userAuthService.signup.mockRejectedValue(new ConflictException('Email already registered'));

      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signup')
        .send({ email: USER_EMAIL, password: USER_PASSWORD });

      expect(res.status).toBe(409);
    });

    it('returns 400 for an invalid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signup')
        .send({ email: 'not-an-email', password: USER_PASSWORD });

      expect(res.status).toBe(400);
      expect(userAuthService.signup).not.toHaveBeenCalled();
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signup')
        .send({ email: USER_EMAIL, password: 'short' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when email is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signup')
        .send({ password: USER_PASSWORD });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/user/signin
  // -------------------------------------------------------------------------

  describe('POST /api/v1/user/signin', () => {
    it('returns a JWT for valid credentials', async () => {
      userAuthService.signin.mockResolvedValue({
        user: { id: USER_ID, email: USER_EMAIL, name: 'Alice' },
        token: 'signed-token',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signin')
        .send({ email: USER_EMAIL, password: USER_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        user: { id: USER_ID, email: USER_EMAIL },
        token: expect.any(String),
      });
    });

    it('returns 401 when signin service throws UnauthorizedException', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      userAuthService.signin.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signin')
        .send({ email: 'unknown@example.com', password: USER_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('returns 401 for incorrect password', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      userAuthService.signin.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signin')
        .send({ email: USER_EMAIL, password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('returns 400 for missing email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/user/signin')
        .send({ password: USER_PASSWORD });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/user/profile
  // -------------------------------------------------------------------------

  describe('GET /api/v1/user/profile', () => {
    it('returns the profile for a valid JWT', async () => {
      userAuthService.getProfile.mockResolvedValue({
        id: USER_ID,
        email: USER_EMAIL,
        name: 'Alice',
        createdAt: new Date().toISOString(),
        settings: {},
        _count: { apiKeys: 2, jobs: 10, schedules: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/user/profile')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: USER_ID, email: USER_EMAIL });
    });

    it('returns 401 without an Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/user/profile');
      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/user/profile')
        .set('Authorization', 'Bearer totally.invalid.token');

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/auth/keys
  // -------------------------------------------------------------------------

  describe('POST /api/v1/auth/keys', () => {
    it('creates an API key when authenticated with JWT', async () => {
      authService.createApiKey.mockResolvedValue({
        id: 'key-uuid-1',
        name: 'My Key',
        key: 'xc_abc123defabc123defabc123defabc123defabc123def',
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/keys')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ name: 'My Key' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'key-uuid-1', name: 'My Key' });
      expect(res.body.key).toBeDefined();
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/keys')
        .send({ name: 'My Key' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when name is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/keys')
        .set('Authorization', `Bearer ${makeJwt()}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/auth/keys
  // -------------------------------------------------------------------------

  describe('GET /api/v1/auth/keys', () => {
    it('lists API keys with masked values', async () => {
      authService.listApiKeys.mockResolvedValue([
        {
          id: 'key-uuid-1',
          name: 'My Key',
          key: 'xc_1234...',
          lastUsed: null,
          active: true,
          createdAt: new Date(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/keys')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].key).toMatch(/\.\.\.$/);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/keys');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/v1/auth/keys/:id
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/auth/keys/:id', () => {
    it('revokes the key when it belongs to the requesting user', async () => {
      authService.revokeApiKey.mockResolvedValue({ success: true });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/auth/keys/key-uuid-1')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true });
      expect(authService.revokeApiKey).toHaveBeenCalledWith('key-uuid-1', USER_ID);
    });

    it('returns 403 when the key belongs to a different user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      authService.revokeApiKey.mockRejectedValue(
        new ForbiddenException('API key does not belong to this user'),
      );

      const res = await request(app.getHttpServer())
        .delete('/api/v1/auth/keys/key-uuid-99')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 when the key does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      authService.revokeApiKey.mockRejectedValue(new NotFoundException('API key not found'));

      const res = await request(app.getHttpServer())
        .delete('/api/v1/auth/keys/nonexistent-id')
        .set('Authorization', `Bearer ${makeJwt()}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).delete('/api/v1/auth/keys/key-uuid-1');
      expect(res.status).toBe(401);
    });
  });
});
