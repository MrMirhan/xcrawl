import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import {
  RATE_LIMIT_KEY,
  RATE_LIMIT_SKIP_KEY,
  type RateLimitOptions,
} from '../decorators/rate-limit.decorator';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  apiKeyId?: string;
  userId?: string;
  url?: string;
  originalUrl?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
}

interface ResponseLike {
  setHeader(name: string, value: string | number): void;
}

const SKIP_PATH_PATTERNS = [/\/health(\b|\/|$)/, /\/metrics(\b|\/|$)/];

/**
 * Sliding window rate limiter backed by Redis.
 *
 * Identity precedence: userId > apiKeyId > x-api-key header > client IP > 'anonymous'.
 * Authenticated requests get a higher ceiling than anonymous traffic.
 * Per-route override available via @RateLimit(limit, window) and @SkipRateLimit().
 *
 * Note: requires the auth guard to run BEFORE this guard so req.userId / req.apiKeyId
 * are populated. Controllers wire them as @UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard).
 */
@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiKeyRateLimitGuard.name);
  private redis!: Redis;
  private maxRequests: number;
  private maxRequestsAnon: number;
  private windowSecs: number;

  constructor(
    private config: ConfigService,
    private reflector: Reflector,
  ) {
    this.maxRequests = parseInt(this.config.get('RATE_LIMIT_MAX', '100'), 10);
    this.maxRequestsAnon = parseInt(
      this.config.get('RATE_LIMIT_MAX_ANON', String(Math.max(1, Math.floor(this.maxRequests / 5)))),
      10,
    );
    this.windowSecs = parseInt(this.config.get('RATE_LIMIT_WINDOW_SECS', '60'), 10);
  }

  onModuleInit() {
    const redisUrl = this.config.get('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const response = context.switchToHttp().getResponse<ResponseLike>();

    if (this.isSkipped(context, request)) {
      return true;
    }

    const override = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const identity = this.resolveIdentity(request);
    const limit = override?.limit ?? this.limitFor(identity.authenticated);
    const window = override?.window ?? this.windowSecs;

    const keyHash = crypto.createHash('sha256').update(identity.raw).digest('hex');
    const key = `ratelimit:${identity.scope}:${keyHash}`;
    const now = Date.now();
    const windowStart = now - window * 1000;

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}:${crypto.randomBytes(4).toString('hex')}`);
    pipeline.zcard(key);
    pipeline.expire(key, window);

    const results = await pipeline.exec();
    const requestCount = (results?.[2]?.[1] as number) ?? 0;

    const remaining = Math.max(0, limit - requestCount);
    const resetEpoch = Math.ceil((now + window * 1000) / 1000);

    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', resetEpoch);

    if (requestCount > limit) {
      response.setHeader('Retry-After', window);
      this.logger.warn(
        `Rate limit exceeded for ${identity.scope}:${keyHash.slice(0, 8)} ` +
          `(${requestCount}/${limit} in ${window}s)`,
      );
      throw new HttpException(
        {
          success: false,
          error: 'Rate limit exceeded',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retryAfter: window,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private isSkipped(context: ExecutionContext, request: RequestLike): boolean {
    const skipMeta = this.reflector.getAllAndOverride<boolean | undefined>(
      RATE_LIMIT_SKIP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipMeta) return true;

    const path = request.originalUrl ?? request.url ?? '';
    return SKIP_PATH_PATTERNS.some((pattern) => pattern.test(path));
  }

  private limitFor(authenticated: boolean): number {
    return authenticated ? this.maxRequests : this.maxRequestsAnon;
  }

  private resolveIdentity(request: RequestLike): {
    raw: string;
    scope: 'user' | 'apiKey' | 'header' | 'ip' | 'anon';
    authenticated: boolean;
  } {
    if (request.userId) {
      return { raw: request.userId, scope: 'user', authenticated: true };
    }
    if (request.apiKeyId) {
      return { raw: request.apiKeyId, scope: 'apiKey', authenticated: true };
    }

    const headerKey = request.headers['x-api-key'];
    const apiKeyHeader = Array.isArray(headerKey) ? headerKey[0] : headerKey;
    if (apiKeyHeader) {
      return { raw: apiKeyHeader, scope: 'header', authenticated: false };
    }

    const ip = request.ip ?? request.socket?.remoteAddress;
    if (ip) {
      return { raw: ip, scope: 'ip', authenticated: false };
    }

    return { raw: 'anonymous', scope: 'anon', authenticated: false };
  }
}
