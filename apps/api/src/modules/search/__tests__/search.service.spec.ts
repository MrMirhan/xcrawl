import { SearchService } from '../search.service';
import { SearchRequestDto } from '../dto/search-request.dto';

const mockScrape = jest.fn();

const mockCrawlerEngineService = {
  instance: {
    scrape: mockScrape,
  },
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => defaultValue ?? ''),
};

const mockPrismaService = {
  usageEvent: {
    create: jest.fn().mockResolvedValue({}),
  },
};

const mockUsageService = {
  assertWithinQuota: jest.fn().mockResolvedValue(undefined),
};

describe('SearchService', () => {
  let service: SearchService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    mockPrismaService.usageEvent.create.mockResolvedValue({});
    mockUsageService.assertWithinQuota.mockResolvedValue(undefined);
    service = new SearchService(
      mockConfigService as never,
      mockCrawlerEngineService as never,
      mockPrismaService as never,
      mockUsageService as never,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('search — SearXNG path', () => {
    it('returns parsed results when SearXNG responds successfully', async () => {
      const searxngUrl = 'http://searxng.local';
      const dto: SearchRequestDto = { query: 'typescript', searxngUrl };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { url: 'https://example.com/a', title: 'Title A', content: 'Snippet A' },
              { url: 'https://example.com/b', title: 'Title B', content: 'Snippet B' },
            ],
          }),
      }) as jest.Mock;

      mockScrape.mockResolvedValue({
        markdown: '# Example',
        metadata: { title: 'Scraped Title' },
        statusCode: 200,
      });

      const result = await service.search(dto);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect((result.data as { url: string }[])[0].url).toBe('https://example.com/a');
    });

    it('picks up SearXNG URL from env via ConfigService when dto.searxngUrl is absent', async () => {
      const envUrl = 'http://searxng-from-env.local';
      mockConfigService.get.mockImplementation((key: string, def?: string) =>
        key === 'SEARXNG_URL' ? envUrl : (def ?? ''),
      );

      const dto: SearchRequestDto = { query: 'nodejs' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ url: 'https://nodejs.org', title: 'Node.js', content: 'Async JS' }],
          }),
      }) as jest.Mock;

      mockScrape.mockResolvedValue({ markdown: '# Node', metadata: {}, statusCode: 200 });

      const result = await service.search(dto);

      const fetchMock = global.fetch as jest.Mock;
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain(envUrl);
      expect(result.success).toBe(true);
    });

    it('falls back to DuckDuckGo when no SearXNG URL is configured', async () => {
      mockConfigService.get.mockReturnValue('');
      const dto: SearchRequestDto = { query: 'deno runtime' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      }) as jest.Mock;

      const result = await service.search(dto);

      const fetchMock = global.fetch as jest.Mock;
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('duckduckgo.com');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('returns empty data when SearXNG returns no results', async () => {
      const dto: SearchRequestDto = { query: 'xyzzy-nonexistent', searxngUrl: 'http://searxng.local' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as jest.Mock;

      const result = await service.search(dto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('returns empty data when SearXNG responds with a non-200 status', async () => {
      const dto: SearchRequestDto = { query: 'something', searxngUrl: 'http://searxng.local' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }) as jest.Mock;

      const result = await service.search(dto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('returns empty data when fetch throws a network error', async () => {
      const dto: SearchRequestDto = { query: 'something', searxngUrl: 'http://unreachable.local' };

      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as jest.Mock;

      const result = await service.search(dto);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('includes a result entry even when individual page scraping fails', async () => {
      const dto: SearchRequestDto = { query: 'resilience', searxngUrl: 'http://searxng.local' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ url: 'https://example.com/fail', title: 'Fail Page', content: 'Some snippet' }],
          }),
      }) as jest.Mock;

      mockScrape.mockRejectedValue(new Error('Timeout'));

      const result = await service.search(dto);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect((result.data as { url: string }[])[0].url).toBe('https://example.com/fail');
    });

    it('respects the limit parameter by slicing results', async () => {
      const dto: SearchRequestDto = { query: 'many results', searxngUrl: 'http://searxng.local', limit: 2 };

      const allResults = Array.from({ length: 5 }, (_, i) => ({
        url: `https://example.com/${i}`,
        title: `Title ${i}`,
        content: `Snippet ${i}`,
      }));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: allResults }),
      }) as jest.Mock;

      mockScrape.mockResolvedValue({ markdown: '# Page', metadata: {}, statusCode: 200 });

      const result = await service.search(dto);

      expect(result.count).toBe(2);
    });
  });

  describe('usage quota enforcement & event write', () => {
    it('calls assertWithinQuota with SEARCH pool and userId before searching', async () => {
      const dto: SearchRequestDto = { query: 'typescript', searxngUrl: 'http://searxng.local' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as jest.Mock;

      await service.search(dto, 'user-1');

      expect(mockUsageService.assertWithinQuota).toHaveBeenCalledWith('user-1', 'SEARCH');
    });

    it('rejects the request when assertWithinQuota throws, before touching the search engine', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockUsageService.assertWithinQuota.mockRejectedValue(
        new ForbiddenException('Daily SEARCH limit reached'),
      );
      const dto: SearchRequestDto = { query: 'typescript', searxngUrl: 'http://searxng.local' };
      global.fetch = jest.fn() as jest.Mock;

      await expect(service.search(dto, 'user-1')).rejects.toThrow(ForbiddenException);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('writes one SEARCH usageEvent when userId is present and search succeeds', async () => {
      const dto: SearchRequestDto = { query: 'typescript', searxngUrl: 'http://searxng.local' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as jest.Mock;

      await service.search(dto, 'user-1');

      expect(mockPrismaService.usageEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'user-1', pool: 'SEARCH', amount: 1 } }),
      );
      expect(mockPrismaService.usageEvent.create).toHaveBeenCalledTimes(1);
    });

    it('does not write a usageEvent when userId is absent', async () => {
      const dto: SearchRequestDto = { query: 'typescript', searxngUrl: 'http://searxng.local' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as jest.Mock;

      await service.search(dto);

      expect(mockPrismaService.usageEvent.create).not.toHaveBeenCalled();
    });
  });
});
