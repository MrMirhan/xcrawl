import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as crypto from 'crypto';

/**
 * Custom rate limiter using Redis sliding window per API key.
 * More granular than @nestjs/throttler — limits per API key, not per IP.
 */
@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private redis!: Redis;
  private maxRequests: number;
  private windowSecs: number;

  constructor(private config: ConfigService) {
    this.maxRequests = parseInt(this.config.get('RATE_LIMIT_MAX', '100'), 10);
    this.windowSecs = parseInt(this.config.get('RATE_LIMIT_WINDOW_SECS', '60'), 10);
  }

  onModuleInit() {
    const redisUrl = this.config.get('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey: string = request.headers['x-api-key'] || 'anonymous';

    // Hash so plaintext keys are never written to Redis keyspace
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const key = `ratelimit:${keyHash}`;
    const now = Date.now();
    const windowStart = now - this.windowSecs * 1000;

    // Sliding window using sorted set
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, this.windowSecs);

    const results = await pipeline.exec();
    const requestCount = results?.[2]?.[1] as number;

    // Set rate limit headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', this.maxRequests);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - requestCount));
    response.setHeader('X-RateLimit-Reset', Math.ceil((now + this.windowSecs * 1000) / 1000));

    if (requestCount > this.maxRequests) {
      throw new HttpException(
        {
          success: false,
          error: 'Rate limit exceeded',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retryAfter: this.windowSecs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
