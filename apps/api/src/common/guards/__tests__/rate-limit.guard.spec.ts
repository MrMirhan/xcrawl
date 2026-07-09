import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyRateLimitGuard } from '../rate-limit.guard';
import {
  RATE_LIMIT_KEY,
  RATE_LIMIT_SKIP_KEY,
} from '../../decorators/rate-limit.decorator';
import * as crypto from 'crypto';

// Mock ioredis before it gets required by the guard
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Pipeline mock — methods return the pipeline itself for chaining
const mockPipelineExec = jest.fn();
const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: mockPipelineExec,
};

const mockRedisInstance = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  quit: jest.fn(),
};

const mockSetHeader = jest.fn();
const mockResponse = { setHeader: mockSetHeader };

interface ContextOpts {
  apiKey?: string;
  userId?: string;
  apiKeyId?: string;
  url?: string;
  ip?: string;
}

function buildContext(opts: ContextOpts = {}): ExecutionContext {
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;

  const request = {
    headers,
    userId: opts.userId,
    apiKeyId: opts.apiKeyId,
    url: opts.url ?? '/api/v1/scrape',
    originalUrl: opts.url ?? '/api/v1/scrape',
    ip: opts.ip,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => mockResponse,
    }),
    getHandler: () => () => undefined,
    getClass: () => class Dummy {},
  } as unknown as ExecutionContext;
}

function buildPipelineResult(requestCount: number) {
  return [
    [null, 0],         // zremrangebyscore result
    [null, 1],         // zadd result
    [null, requestCount], // zcard result (the count we care about)
    [null, 1],         // expire result
  ];
}

describe('ApiKeyRateLimitGuard', () => {
  let guard: ApiKeyRateLimitGuard;
  let reflector: Reflector;

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      if (key === 'RATE_LIMIT_MAX') return '25';
      if (key === 'RATE_LIMIT_MAX_ANON') return '5';
      if (key === 'RATE_LIMIT_WINDOW_SECS') return '60';
      if (key === 'redis.url') return 'redis://localhost:6379';
      return defaultVal;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisInstance.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.zremrangebyscore.mockReturnThis();
    mockPipeline.zadd.mockReturnThis();
    mockPipeline.zcard.mockReturnThis();
    mockPipeline.expire.mockReturnThis();

    reflector = new Reflector();
    guard = new ApiKeyRateLimitGuard(mockConfigService as never, reflector);
    guard.onModuleInit();
  });

  describe('onModuleInit / onModuleDestroy', () => {
    it('reads RATE_LIMIT_MAX from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('RATE_LIMIT_MAX', '100');
    });

    it('reads RATE_LIMIT_WINDOW_SECS from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('RATE_LIMIT_WINDOW_SECS', '60');
    });

    it('calls redis.quit on module destroy', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');
      await guard.onModuleDestroy();
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });
  });

  describe('canActivate — within rate limit', () => {
    it('returns true when request count is within the limit', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(3)); // 3 of 5 used

      const ctx = buildContext({ apiKey: 'test-api-key' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('returns true at exactly the limit (boundary condition)', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(5)); // 5 of 5 — at limit but not over

      const ctx = buildContext({ apiKey: 'test-api-key' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  describe('canActivate — over rate limit', () => {
    it('throws HttpException with 429 when request count exceeds the limit', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(6)); // 6 > 5

      const ctx = buildContext({ apiKey: 'test-api-key' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    });

    it('throws with statusCode 429 TOO_MANY_REQUESTS', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(100));

      const ctx = buildContext({ apiKey: 'test-api-key' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
      );
    });

    it('includes retryAfter in the thrown error response', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10));

      const ctx = buildContext({ apiKey: 'test-api-key' });

      try {
        await guard.canActivate(ctx);
        fail('Expected HttpException to be thrown');
      } catch (err) {
        const exception = err as HttpException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response.retryAfter).toBeDefined();
      }
    });

    it('includes success: false in the thrown error response', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10));

      const ctx = buildContext({ apiKey: 'test-api-key' });

      try {
        await guard.canActivate(ctx);
      } catch (err) {
        const exception = err as HttpException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response.success).toBe(false);
      }
    });

    it('sets Retry-After header on 429', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10));

      try {
        await guard.canActivate(buildContext({ apiKey: 'k' }));
      } catch {
        // expected
      }

      expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', 60);
    });
  });

  describe('Redis key uses SHA-256 hash of identity', () => {
    it('does not use the raw API key as a Redis key', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const rawApiKey = 'xc_live_super_secret_key';

      const ctx = buildContext({ apiKey: rawApiKey });
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).not.toContain(rawApiKey);
    });

    it('uses a SHA-256 hash of the API key in the Redis key', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const rawApiKey = 'xc_live_super_secret_key';
      const expectedHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      const ctx = buildContext({ apiKey: rawApiKey });
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toContain(expectedHash);
    });

    it('prefixes the hash key with "ratelimit:"', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      const ctx = buildContext({ apiKey: 'some-key' });
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toMatch(/^ratelimit:/);
    });

    it('falls back to "anonymous" identity when no header, no auth, no ip', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const anonymousHash = crypto.createHash('sha256').update('anonymous').digest('hex');

      const ctx = buildContext(); // no api key, no auth, no ip
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toContain(anonymousHash);
    });
  });

  describe('identity scoping', () => {
    it('uses userId as identity when authenticated via JWT', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const userId = 'user-abc-123';
      const expectedHash = crypto.createHash('sha256').update(userId).digest('hex');

      await guard.canActivate(buildContext({ userId }));

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toBe(`ratelimit:user:${expectedHash}`);
    });

    it('uses apiKeyId as identity when authenticated via api key (no userId)', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const apiKeyId = 'key-id-42';
      const expectedHash = crypto.createHash('sha256').update(apiKeyId).digest('hex');

      await guard.canActivate(buildContext({ apiKeyId, apiKey: 'should-be-ignored' }));

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toBe(`ratelimit:apiKey:${expectedHash}`);
    });

    it('uses client ip when no auth identity and no header', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const ip = '203.0.113.7';
      const expectedHash = crypto.createHash('sha256').update(ip).digest('hex');

      await guard.canActivate(buildContext({ ip }));

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toBe(`ratelimit:ip:${expectedHash}`);
    });

    it('does not throw on an unauthenticated signin/signup request (no userId, no apiKeyId, no header)', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      const ctx = buildContext({ url: '/api/v1/user/signin', ip: '203.0.113.9' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  describe('auth-aware limits', () => {
    it('gives authenticated requests the higher RATE_LIMIT_MAX ceiling', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(20));

      await guard.canActivate(buildContext({ userId: 'u1' }));

      // 25 limit, 20 used, 5 remaining — authenticated path
      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 25);
      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 5);
    });

    it('gives anonymous requests the lower RATE_LIMIT_MAX_ANON ceiling', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(2));

      await guard.canActivate(buildContext({ apiKey: 'header-only' }));

      // header-only (not authenticated) gets anon limit of 5
      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    });

    it('authenticated user does not 429 below the auth limit but above the anon limit', async () => {
      // 10 used > anon limit (5) but < auth limit (25)
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10));

      const result = await guard.canActivate(buildContext({ userId: 'u1' }));

      expect(result).toBe(true);
    });
  });

  describe('skip patterns', () => {
    it('skips rate limiting for /api/v1/health', async () => {
      const ctx = buildContext({ url: '/api/v1/health', apiKey: 'k' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPipeline.zadd).not.toHaveBeenCalled();
    });

    it('skips rate limiting for /metrics', async () => {
      const ctx = buildContext({ url: '/metrics' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPipeline.zadd).not.toHaveBeenCalled();
    });

    it('honours the @SkipRateLimit() metadata flag', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) => (key === RATE_LIMIT_SKIP_KEY ? true : undefined));

      const result = await guard.canActivate(buildContext({ apiKey: 'k' }));

      expect(result).toBe(true);
      expect(mockPipeline.zadd).not.toHaveBeenCalled();
    });
  });

  describe('per-route @RateLimit() override', () => {
    it('respects a per-route limit lower than the default', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) =>
          key === RATE_LIMIT_KEY ? { limit: 2, window: 30 } : undefined,
        );

      mockPipelineExec.mockResolvedValue(buildPipelineResult(3));

      await expect(
        guard.canActivate(buildContext({ userId: 'u1' })),
      ).rejects.toThrow(HttpException);

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 2);
    });

    it('uses the override window for expire', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: string) =>
          key === RATE_LIMIT_KEY ? { limit: 50, window: 10 } : undefined,
        );

      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext({ userId: 'u1' }));

      expect(mockPipeline.expire).toHaveBeenCalledWith(expect.any(String), 10);
    });
  });

  describe('rate limit response headers', () => {
    it('sets X-RateLimit-Limit header', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(2));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      // header-only is anonymous → uses RATE_LIMIT_MAX_ANON (5)
      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    });

    it('sets X-RateLimit-Remaining header to (max - used) when under limit', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(2));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 3);
    });

    it('sets X-RateLimit-Remaining to 0 when over limit (does not go negative)', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10)); // over limit

      try {
        await guard.canActivate(buildContext({ apiKey: 'key' }));
      } catch {
        // Expected 429 — we still want to verify headers were set
      }

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    });

    it('sets X-RateLimit-Reset header as a Unix timestamp', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      const resetHeaderCall = mockSetHeader.mock.calls.find(
        (call) => call[0] === 'X-RateLimit-Reset',
      );
      expect(resetHeaderCall).toBeDefined();
      const resetTimestamp = resetHeaderCall![1] as number;
      // Reset should be in the near future (within the window)
      expect(resetTimestamp).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('Redis pipeline operations', () => {
    it('uses a sliding window with zremrangebyscore to remove expired entries', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        expect.any(String),
        0,
        expect.any(Number),
      );
    });

    it('adds the current request to the sorted set with zadd', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      expect(mockPipeline.zadd).toHaveBeenCalled();
    });

    it('counts current window requests with zcard', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      expect(mockPipeline.zcard).toHaveBeenCalled();
    });

    it('sets key expiry with expire', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext({ apiKey: 'key' }));

      expect(mockPipeline.expire).toHaveBeenCalledWith(expect.any(String), 60);
    });
  });
});
