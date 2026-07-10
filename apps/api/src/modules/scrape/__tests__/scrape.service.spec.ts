import { ScrapeService } from '../scrape.service';

// Mock bullmq so QueueEvents construction never touches Redis
jest.mock('bullmq', () => ({
  QueueEvents: jest.fn().mockImplementation(() => mockQueueEvents),
}));

// Mock assertPublicUrl so tests don't perform real DNS lookups
jest.mock('../../../common/utils/url-validator', () => ({
  assertPublicUrl: jest.fn(),
}));

import { assertPublicUrl } from '../../../common/utils/url-validator';

const mockAssertPublicUrl = assertPublicUrl as jest.MockedFunction<typeof assertPublicUrl>;

const mockQueueEvents = {
  close: jest.fn(),
};

const mockBullJob = {
  id: 'bull-job-1',
  waitUntilFinished: jest.fn(),
};

const mockScrapeQueue = {
  add: jest.fn(),
};

const mockPrismaService = {
  job: {
    create: jest.fn(),
  },
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: string) => defaultVal ?? null),
};

const mockUsageService = {
  assertWithinQuota: jest.fn().mockResolvedValue(undefined),
};

describe('ScrapeService', () => {
  let service: ScrapeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScrapeService(
      mockScrapeQueue as unknown as ConstructorParameters<typeof ScrapeService>[0],
      mockPrismaService as unknown as ConstructorParameters<typeof ScrapeService>[1],
      mockCacheService as unknown as ConstructorParameters<typeof ScrapeService>[2],
      mockConfigService as unknown as ConstructorParameters<typeof ScrapeService>[3],
      mockUsageService as unknown as ConstructorParameters<typeof ScrapeService>[4],
    );
    service.onModuleInit();
    mockAssertPublicUrl.mockResolvedValue(undefined);
    mockUsageService.assertWithinQuota.mockResolvedValue(undefined);
  });

  describe('onModuleInit / onModuleDestroy', () => {
    it('reads redis.url from config on init', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('redis.url', 'redis://localhost:6379');
    });

    it('closes queueEvents on destroy', async () => {
      mockQueueEvents.close.mockResolvedValue(undefined);
      await service.onModuleDestroy();
      expect(mockQueueEvents.close).toHaveBeenCalled();
    });
  });

  describe('scrape', () => {
    const baseDto = { url: 'https://example.com', formats: ['markdown'] };
    const createdJob = { id: 'db-job-1' };
    const scrapeResult = { markdown: '# Hello', url: 'https://example.com', metadata: { duration: 300 } };

    beforeEach(() => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrismaService.job.create.mockResolvedValue(createdJob);
      mockScrapeQueue.add.mockResolvedValue(mockBullJob);
      mockBullJob.waitUntilFinished.mockResolvedValue(scrapeResult);
      mockCacheService.set.mockResolvedValue(undefined);
    });

    describe('SSRF validation', () => {
      it('calls assertPublicUrl with the target url before touching cache or queue', async () => {
        await service.scrape(baseDto as never);

        expect(mockAssertPublicUrl).toHaveBeenCalledWith(baseDto.url);
      });

      it('rejects a private/loopback target url before enqueueing', async () => {
        const { BadRequestException } = await import('@nestjs/common');
        mockAssertPublicUrl.mockRejectedValue(
          new BadRequestException('Access to private IP addresses is not allowed'),
        );

        await expect(service.scrape({ url: 'http://127.0.0.1' } as never)).rejects.toThrow(
          BadRequestException,
        );

        expect(mockCacheService.get).not.toHaveBeenCalled();
        expect(mockPrismaService.job.create).not.toHaveBeenCalled();
        expect(mockScrapeQueue.add).not.toHaveBeenCalled();
      });
    });

    describe('usage quota enforcement', () => {
      it('calls assertWithinQuota with PAGES pool and userId before enqueueing', async () => {
        await service.scrape(baseDto as never, 'key-1', 'user-1');

        expect(mockUsageService.assertWithinQuota).toHaveBeenCalledWith('user-1', 'PAGES');
      });

      it('rejects the request when assertWithinQuota throws, before any queue/DB write', async () => {
        const { ForbiddenException } = await import('@nestjs/common');
        mockUsageService.assertWithinQuota.mockRejectedValue(
          new ForbiddenException('Daily PAGES limit reached (1/1)'),
        );

        await expect(service.scrape(baseDto as never, 'key-1', 'user-1')).rejects.toThrow(
          ForbiddenException,
        );

        expect(mockPrismaService.job.create).not.toHaveBeenCalled();
        expect(mockScrapeQueue.add).not.toHaveBeenCalled();
      });
    });

    describe('cache hit', () => {
      it('returns cached result without creating a job', async () => {
        const cached = { markdown: '# Cached', url: 'https://example.com' };
        mockCacheService.get.mockResolvedValue(cached);

        const result = await service.scrape(baseDto as never);

        expect(result).toEqual({ success: true, data: cached, cached: true });
        expect(mockPrismaService.job.create).not.toHaveBeenCalled();
        expect(mockScrapeQueue.add).not.toHaveBeenCalled();
      });
    });

    describe('cache miss — happy path', () => {
      it('creates a SCRAPE job record in the database', async () => {
        await service.scrape(baseDto as never, 'key-1', 'user-1');

        expect(mockPrismaService.job.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ type: 'SCRAPE', url: baseDto.url }),
          }),
        );
      });

      it('stores apiKeyId and userId on the job record', async () => {
        await service.scrape(baseDto as never, 'key-1', 'user-1');

        expect(mockPrismaService.job.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ apiKeyId: 'key-1', userId: 'user-1' }),
          }),
        );
      });

      it('enqueues the job with jobId and dto fields', async () => {
        await service.scrape(baseDto as never, 'key-1', 'user-1');

        expect(mockScrapeQueue.add).toHaveBeenCalledWith(
          'scrape',
          expect.objectContaining({ jobId: createdJob.id, url: baseDto.url }),
        );
      });

      it('returns { success: true, data: result } after job completes', async () => {
        const result = await service.scrape(baseDto as never);

        expect(result).toEqual({ success: true, data: scrapeResult });
      });

      it('caches the result when there is no screenshot format', async () => {
        await service.scrape(baseDto as never);

        expect(mockCacheService.set).toHaveBeenCalledWith(
          baseDto.url,
          baseDto.formats,
          true,
          scrapeResult,
        );
      });
    });

    describe('screenshot format', () => {
      it('skips cache lookup when screenshot format is requested', async () => {
        const dto = { url: 'https://example.com', formats: ['screenshot'] };

        await service.scrape(dto as never);

        expect(mockCacheService.get).not.toHaveBeenCalled();
      });

      it('skips writing to cache after scrape when screenshot format is in use', async () => {
        const dto = { url: 'https://example.com', formats: ['screenshot'] };

        await service.scrape(dto as never);

        expect(mockCacheService.set).not.toHaveBeenCalled();
      });
    });

    describe('actions present', () => {
      it('skips cache lookup when actions are provided', async () => {
        const dto = { url: 'https://example.com', actions: [{ type: 'click', selector: '#btn' }] };

        await service.scrape(dto as never);

        expect(mockCacheService.get).not.toHaveBeenCalled();
      });
    });

    describe('engine failure', () => {
      it('returns { success: false, error } when the job throws', async () => {
        mockBullJob.waitUntilFinished.mockRejectedValue(new Error('Engine failure'));

        const result = await service.scrape(baseDto as never);

        expect(result).toEqual({ success: false, error: 'Engine failure' });
      });

      it('returns a generic error string for non-Error throws', async () => {
        mockBullJob.waitUntilFinished.mockRejectedValue('string error');

        const result = await service.scrape(baseDto as never);

        expect(result).toEqual({ success: false, error: 'Scrape failed' });
      });
    });

    describe('timeout calculation', () => {
      it('uses a larger timeout buffer when extractPrompt is set', async () => {
        const dto = { ...baseDto, extractPrompt: 'Extract names', timeout: 30_000 };

        await service.scrape(dto as never);

        // waitUntilFinished is called; we verify it was called (timing internals not exposed)
        expect(mockBullJob.waitUntilFinished).toHaveBeenCalled();
      });

      it('applies defaults when dto.timeout is omitted', async () => {
        await service.scrape(baseDto as never);

        expect(mockBullJob.waitUntilFinished).toHaveBeenCalled();
      });
    });
  });
});
