import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis-based caching layer for scrape results.
 * Caches by URL + formats combination with configurable TTL.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;
  private defaultTtl: number;

  constructor(private config: ConfigService) {
    this.defaultTtl = parseInt(this.config.get('CACHE_TTL_SECS', '3600'), 10);
  }

  async onModuleInit() {
    const redisUrl = this.config.get('redis.url', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private getCacheKey(url: string, formats: string[], onlyMainContent: boolean): string {
    const normalized = url.toLowerCase().replace(/\/$/, '');
    const formatKey = [...formats].sort().join(',');
    return `cache:scrape:${normalized}:${formatKey}:${onlyMainContent}`;
  }

  /** Iterate all keys matching a pattern using SCAN (non-blocking). */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  async get(url: string, formats: string[], onlyMainContent: boolean): Promise<unknown | null> {
    const key = this.getCacheKey(url, formats, onlyMainContent);
    const cached = await this.redis.get(key);
    if (!cached) return null;

    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  async set(
    url: string,
    formats: string[],
    onlyMainContent: boolean,
    data: unknown,
    ttl?: number,
  ): Promise<void> {
    const key = this.getCacheKey(url, formats, onlyMainContent);
    const serialized = JSON.stringify(data);
    await this.redis.setex(key, ttl ?? this.defaultTtl, serialized);
  }

  async invalidate(url: string): Promise<void> {
    const pattern = `cache:scrape:${url.toLowerCase().replace(/\/$/, '')}:*`;
    const keys = await this.scanKeys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async clear(): Promise<void> {
    const keys = await this.scanKeys('cache:scrape:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getStats(): Promise<{ size: number; memoryUsage: string }> {
    const keys = await this.scanKeys('cache:scrape:*');
    const info = await this.redis.info('memory');
    const memMatch = info.match(/used_memory_human:(\S+)/);
    return {
      size: keys.length,
      memoryUsage: memMatch?.[1] ?? 'unknown',
    };
  }
}
