import { CacheService } from '../cache.service';

// Mock ioredis before it gets required by the service
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

const mockRedisInstance = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  info: jest.fn(),
  quit: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: string) => {
    if (key === 'CACHE_TTL_SECS') return '3600';
    if (key === 'redis.url') return 'redis://localhost:6379';
    return defaultVal;
  }),
};

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new CacheService(mockConfigService as any);
    await service.onModuleInit();
  });

  describe('onModuleInit / onModuleDestroy', () => {
    it('calls config.get for redis.url on init', async () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('redis.url', 'redis://localhost:6379');
    });

    it('calls redis.quit on module destroy', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');
      await service.onModuleDestroy();
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns parsed JSON when the cache key exists', async () => {
      const data = { markdown: '# Hello', html: '<h1>Hello</h1>' };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(data));

      const result = await service.get('https://example.com', ['markdown'], true);

      expect(result).toEqual(data);
    });

    it('returns null when the cache key does not exist (cache miss)', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await service.get('https://example.com', ['markdown'], true);

      expect(result).toBeNull();
    });

    it('returns null when the cached value is invalid JSON', async () => {
      mockRedisInstance.get.mockResolvedValue('not-valid-json{{{');

      const result = await service.get('https://example.com', ['markdown'], true);

      expect(result).toBeNull();
    });

    it('normalizes the URL to lowercase', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      await service.get('HTTPS://EXAMPLE.COM/PATH', ['markdown'], true);

      expect(mockRedisInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com/path'),
      );
    });

    it('removes trailing slash from URL in the cache key', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      await service.get('https://example.com/', ['markdown'], true);

      const calledKey = mockRedisInstance.get.mock.calls[0][0] as string;
      expect(calledKey).not.toMatch(/\/:/);
    });

    it('includes onlyMainContent flag in the cache key', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      await service.get('https://example.com', ['markdown'], false);

      expect(mockRedisInstance.get).toHaveBeenCalledWith(
        expect.stringContaining(':false'),
      );
    });
  });

  describe('set', () => {
    it('calls setex with the default TTL when none is provided', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');

      await service.set('https://example.com', ['markdown'], true, { data: 'value' });

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        expect.any(String),
        3600,
        expect.any(String),
      );
    });

    it('calls setex with a custom TTL when provided', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');

      await service.set('https://example.com', ['markdown'], true, { data: 'value' }, 600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        expect.any(String),
        600,
        expect.any(String),
      );
    });

    it('serializes the data to JSON before storing', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');
      const data = { markdown: '# Title', links: ['https://a.com'] };

      await service.set('https://example.com', ['markdown'], true, data);

      const storedValue = mockRedisInstance.setex.mock.calls[0][2];
      expect(JSON.parse(storedValue)).toEqual(data);
    });

    it('uses the same key format as get so cached data can be retrieved', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');
      mockRedisInstance.get.mockImplementation(async (key: string) => {
        const storedKey = mockRedisInstance.setex.mock.calls[0]?.[0];
        return key === storedKey ? JSON.stringify({ data: 'cached' }) : null;
      });

      await service.set('https://example.com', ['markdown', 'html'], true, { data: 'cached' });
      const result = await service.get('https://example.com', ['markdown', 'html'], true);

      expect(result).toEqual({ data: 'cached' });
    });
  });

  describe('getCacheKey (format sorting — no mutation of input)', () => {
    it('does not mutate the input formats array', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      const formats = ['html', 'markdown'];
      const originalFormats = [...formats];

      await service.get('https://example.com', formats, true);

      expect(formats).toEqual(originalFormats);
    });

    it('produces the same key regardless of formats array order', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      await service.get('https://example.com', ['html', 'markdown'], true);
      const keyWithHtmlFirst = mockRedisInstance.get.mock.calls[0][0];

      jest.clearAllMocks();
      mockRedisInstance.get.mockResolvedValue(null);

      await service.get('https://example.com', ['markdown', 'html'], true);
      const keyWithMarkdownFirst = mockRedisInstance.get.mock.calls[0][0];

      expect(keyWithHtmlFirst).toBe(keyWithMarkdownFirst);
    });
  });

  describe('invalidate', () => {
    it('scans for keys matching the URL pattern and deletes them', async () => {
      // Simulate single-pass SCAN returning two keys then done
      mockRedisInstance.scan
        .mockResolvedValueOnce(['0', ['cache:scrape:https://example.com:markdown:true', 'cache:scrape:https://example.com:html:false']]);
      mockRedisInstance.del.mockResolvedValue(2);

      await service.invalidate('https://example.com');

      expect(mockRedisInstance.scan).toHaveBeenCalled();
      expect(mockRedisInstance.del).toHaveBeenCalledWith(
        'cache:scrape:https://example.com:markdown:true',
        'cache:scrape:https://example.com:html:false',
      );
    });

    it('does not call del when no keys match', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      await service.invalidate('https://example.com');

      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });

    it('uses a wildcard pattern scoped to the given URL', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      await service.invalidate('https://example.com');

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        expect.any(String),
        'MATCH',
        expect.stringContaining('https://example.com'),
        'COUNT',
        100,
      );
    });
  });

  describe('clear', () => {
    it('scans for all cache:scrape:* keys and deletes them', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', ['cache:scrape:key1', 'cache:scrape:key2']]);
      mockRedisInstance.del.mockResolvedValue(2);

      await service.clear();

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        expect.any(String),
        'MATCH',
        'cache:scrape:*',
        'COUNT',
        100,
      );
      expect(mockRedisInstance.del).toHaveBeenCalledWith('cache:scrape:key1', 'cache:scrape:key2');
    });

    it('does not call del when cache is already empty', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      await service.clear();

      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });

    it('handles multiple SCAN pages correctly', async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(['42', ['key1']])   // cursor non-zero — more pages
        .mockResolvedValueOnce(['0', ['key2']]);   // cursor 0 — done
      mockRedisInstance.del.mockResolvedValue(2);

      await service.clear();

      expect(mockRedisInstance.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisInstance.del).toHaveBeenCalledWith('key1', 'key2');
    });
  });
});
