import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { ApiKeyRateLimitGuard } from '../rate-limit.guard';
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

function buildContext(apiKey?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => mockResponse,
    }),
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

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      if (key === 'RATE_LIMIT_MAX') return '5';
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

    guard = new ApiKeyRateLimitGuard(mockConfigService as any);
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

      const ctx = buildContext('test-api-key');
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('returns true at exactly the limit (boundary condition)', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(5)); // 5 of 5 — at limit but not over

      const ctx = buildContext('test-api-key');
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  describe('canActivate — over rate limit', () => {
    it('throws HttpException with 429 when request count exceeds the limit', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(6)); // 6 > 5

      const ctx = buildContext('test-api-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    });

    it('throws with statusCode 429 TOO_MANY_REQUESTS', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(100));

      const ctx = buildContext('test-api-key');

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
      );
    });

    it('includes retryAfter in the thrown error response', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10));

      const ctx = buildContext('test-api-key');

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

      const ctx = buildContext('test-api-key');

      try {
        await guard.canActivate(ctx);
      } catch (err) {
        const exception = err as HttpException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response.success).toBe(false);
      }
    });
  });

  describe('Redis key uses SHA-256 hash of API key', () => {
    it('does not use the raw API key as a Redis key', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const rawApiKey = 'xc_live_super_secret_key';

      const ctx = buildContext(rawApiKey);
      await guard.canActivate(ctx);

      // Extract the key used in zremrangebyscore
      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).not.toContain(rawApiKey);
    });

    it('uses a SHA-256 hash of the API key in the Redis key', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const rawApiKey = 'xc_live_super_secret_key';
      const expectedHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      const ctx = buildContext(rawApiKey);
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toContain(expectedHash);
    });

    it('prefixes the hash key with "ratelimit:"', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      const ctx = buildContext('some-key');
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toMatch(/^ratelimit:/);
    });

    it('uses "anonymous" as the raw key when no X-API-Key header is provided', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));
      const anonymousHash = crypto.createHash('sha256').update('anonymous').digest('hex');

      const ctx = buildContext(); // no api key
      await guard.canActivate(ctx);

      const rateLimitKey = mockPipeline.zremrangebyscore.mock.calls[0][0] as string;
      expect(rateLimitKey).toContain(anonymousHash);
    });
  });

  describe('rate limit response headers', () => {
    it('sets X-RateLimit-Limit header', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(2));

      await guard.canActivate(buildContext('key'));

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    });

    it('sets X-RateLimit-Remaining header to (max - used) when under limit', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(2));

      await guard.canActivate(buildContext('key'));

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 3);
    });

    it('sets X-RateLimit-Remaining to 0 when over limit (does not go negative)', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(10)); // over limit

      try {
        await guard.canActivate(buildContext('key'));
      } catch {
        // Expected 429 — we still want to verify headers were set
      }

      expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    });

    it('sets X-RateLimit-Reset header as a Unix timestamp', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext('key'));

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

      await guard.canActivate(buildContext('key'));

      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        expect.any(String),
        0,
        expect.any(Number),
      );
    });

    it('adds the current request to the sorted set with zadd', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext('key'));

      expect(mockPipeline.zadd).toHaveBeenCalled();
    });

    it('counts current window requests with zcard', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext('key'));

      expect(mockPipeline.zcard).toHaveBeenCalled();
    });

    it('sets key expiry with expire', async () => {
      mockPipelineExec.mockResolvedValue(buildPipelineResult(1));

      await guard.canActivate(buildContext('key'));

      expect(mockPipeline.expire).toHaveBeenCalledWith(expect.any(String), 60);
    });
  });
});
