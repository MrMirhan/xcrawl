import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CrawlService } from '../crawl.service';

// Mock ioredis before it gets required by the service
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock assertPublicUrl so tests don't perform real DNS lookups
jest.mock('../../../common/utils/url-validator', () => ({
  assertPublicUrl: jest.fn(),
}));

import { assertPublicUrl } from '../../../common/utils/url-validator';

const mockAssertPublicUrl = assertPublicUrl as jest.MockedFunction<typeof assertPublicUrl>;

const mockRedisInstance = {
  exists: jest.fn(),
  set: jest.fn(),
  quit: jest.fn(),
};

const mockPrismaService = {
  job: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  jobResult: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockCrawlQueue = {
  add: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('redis://localhost:6379'),
};

describe('CrawlService', () => {
  let service: CrawlService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CrawlService(
      mockCrawlQueue as any,
      mockPrismaService as any,
      mockConfigService as any,
    );
    // Simulate onModuleInit so redis is assigned
    service.onModuleInit();
    mockAssertPublicUrl.mockResolvedValue(undefined);
  });

  describe('onModuleInit / onModuleDestroy', () => {
    it('calls config.get with redis.url on init', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('redis.url', 'redis://localhost:6379');
    });

    it('calls redis.quit on destroy', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');
      await service.onModuleDestroy();
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });
  });

  describe('cancelKey', () => {
    it('returns the correct Redis key pattern for a job', () => {
      expect(service.cancelKey('job-123')).toBe('crawl:cancel:job-123');
    });
  });

  describe('isCancelled', () => {
    it('returns true when the Redis cancel key exists', async () => {
      mockRedisInstance.exists.mockResolvedValue(1);
      const result = await service.isCancelled('job-abc');
      expect(result).toBe(true);
      expect(mockRedisInstance.exists).toHaveBeenCalledWith('crawl:cancel:job-abc');
    });

    it('returns false when the Redis cancel key does not exist', async () => {
      mockRedisInstance.exists.mockResolvedValue(0);
      const result = await service.isCancelled('job-abc');
      expect(result).toBe(false);
    });
  });

  describe('startCrawl', () => {
    const dto = { url: 'https://example.com', maxPages: 10 };
    const createdJob = { id: 'job-id-1' };

    beforeEach(() => {
      mockPrismaService.job.create.mockResolvedValue(createdJob);
      mockCrawlQueue.add.mockResolvedValue({});
    });

    it('creates a job record in the database with type CRAWL', async () => {
      await service.startCrawl(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CRAWL', url: dto.url }),
        }),
      );
    });

    it('stores apiKeyId and userId on the created job', async () => {
      await service.startCrawl(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiKeyId: 'key-1', userId: 'user-1' }),
        }),
      );
    });

    it('enqueues the job to the crawl queue with the crawl job id', async () => {
      await service.startCrawl(dto as any, 'key-1', 'user-1');

      expect(mockCrawlQueue.add).toHaveBeenCalledWith(
        'crawl',
        expect.objectContaining({ jobId: createdJob.id }),
      );
    });

    it('returns { success: true, id } after enqueueing', async () => {
      const result = await service.startCrawl(dto as any, 'key-1', 'user-1');

      expect(result).toEqual({ success: true, id: createdJob.id });
    });

    it('works without apiKeyId and userId', async () => {
      const result = await service.startCrawl(dto as any);

      expect(result).toEqual({ success: true, id: createdJob.id });
      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiKeyId: undefined, userId: undefined }),
        }),
      );
    });

    describe('SSRF validation', () => {
      it('calls assertPublicUrl with the seed url before enqueueing', async () => {
        await service.startCrawl(dto as any, 'key-1', 'user-1');

        expect(mockAssertPublicUrl).toHaveBeenCalledWith(dto.url);
      });

      it('rejects a private/loopback seed url before creating the job or enqueueing', async () => {
        mockAssertPublicUrl.mockRejectedValue(
          new BadRequestException('Access to private IP addresses is not allowed'),
        );

        await expect(
          service.startCrawl({ url: 'http://169.254.169.254/' } as any),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.job.create).not.toHaveBeenCalled();
        expect(mockCrawlQueue.add).not.toHaveBeenCalled();
      });
    });
  });

  describe('getCrawlStatus', () => {
    const auth = { userId: 'user-1' };
    const mockJob = {
      id: 'job-id-1',
      status: 'RUNNING',
      url: 'https://example.com',
      config: { maxPages: 50 },
      results: [{ url: 'https://example.com', markdown: '# Hello', html: '<h1>Hello</h1>', links: [], images: [], statusCode: 200, metadata: {}, extractedData: null, screenshotPath: null }],
      _count: { results: 3 },
    };

    it('returns job status with progress and data when job exists', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getCrawlStatus('job-id-1', auth);

      expect(result).toMatchObject({
        id: mockJob.id,
        status: mockJob.status,
        data: mockJob.results,
      });
    });

    it('includes progress with completed count and total from config', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getCrawlStatus('job-id-1', auth);

      expect(result.progress).toEqual({
        completed: 3,
        total: 50,
        currentUrl: mockJob.url,
      });
    });

    it('uses 100 as default total when maxPages is not in config', async () => {
      const jobWithoutMaxPages = { ...mockJob, config: {} };
      mockPrismaService.job.findFirst.mockResolvedValue(jobWithoutMaxPages);

      const result = await service.getCrawlStatus('job-id-1', auth);

      expect(result.progress.total).toBe(100);
    });

    it('uses ownedWhere scoping (queries with userId)', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getCrawlStatus('job-id-1', { userId: 'user-42' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-42', id: 'job-id-1' }),
        }),
      );
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.getCrawlStatus('nonexistent', auth)).rejects.toThrow(NotFoundException);
      await expect(service.getCrawlStatus('nonexistent', auth)).rejects.toThrow('Job not found');
    });

    it('includes results with include clause in the query', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getCrawlStatus('job-id-1', auth);

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            results: expect.any(Object),
            _count: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('getCrawlResults', () => {
    const auth = { userId: 'user-1' };
    const mockJob = { id: 'job-id-1' };
    const mockResults = [
      { id: 'r1', url: 'https://example.com/page1' },
      { id: 'r2', url: 'https://example.com/page2' },
    ];

    beforeEach(() => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);
      mockPrismaService.jobResult.findMany.mockResolvedValue(mockResults);
      mockPrismaService.jobResult.count.mockResolvedValue(42);
    });

    it('returns paginated results with pagination metadata', async () => {
      const result = await service.getCrawlResults('job-id-1', 1, 20, auth);

      expect(result).toMatchObject({
        data: mockResults,
        pagination: { page: 1, limit: 20, total: 42, totalPages: 3 },
      });
    });

    it('calculates totalPages correctly', async () => {
      mockPrismaService.jobResult.count.mockResolvedValue(45);

      const result = await service.getCrawlResults('job-id-1', 1, 20, auth);

      expect(result.pagination.totalPages).toBe(3);
    });

    it('applies correct skip offset for page 2', async () => {
      await service.getCrawlResults('job-id-1', 2, 10, auth);

      expect(mockPrismaService.jobResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('uses ownedWhere scoping when looking up the job', async () => {
      await service.getCrawlResults('job-id-1', 1, 20, { apiKeyId: 'key-99' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apiKeyId: 'key-99' }),
        }),
      );
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.getCrawlResults('missing', 1, 20, auth)).rejects.toThrow(NotFoundException);
    });

    it('defaults page=1 and limit=20 when not provided', async () => {
      await service.getCrawlResults('job-id-1', undefined, undefined, auth);

      expect(mockPrismaService.jobResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });
  });

  describe('cancelCrawl', () => {
    const auth = { userId: 'user-1' };
    const mockJob = { id: 'job-id-1' };

    beforeEach(() => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);
      mockRedisInstance.set.mockResolvedValue('OK');
      mockPrismaService.job.update.mockResolvedValue({});
    });

    it('sets a Redis cancel flag with 1 hour expiry', async () => {
      await service.cancelCrawl('job-id-1', auth);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'crawl:cancel:job-id-1',
        '1',
        'EX',
        3600,
      );
    });

    it('updates job status to CANCELLED in the database', async () => {
      await service.cancelCrawl('job-id-1', auth);

      expect(mockPrismaService.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-id-1' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('sets completedAt when cancelling', async () => {
      await service.cancelCrawl('job-id-1', auth);

      expect(mockPrismaService.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ completedAt: expect.any(Date) }),
        }),
      );
    });

    it('returns { success: true } on successful cancel', async () => {
      const result = await service.cancelCrawl('job-id-1', auth);

      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.cancelCrawl('nonexistent', auth)).rejects.toThrow(NotFoundException);
    });

    it('does not set Redis flag when job is not found', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.cancelCrawl('nonexistent', auth)).rejects.toThrow();
      expect(mockRedisInstance.set).not.toHaveBeenCalled();
    });

    it('uses ownedWhere scoping when looking up the job', async () => {
      await service.cancelCrawl('job-id-1', { apiKeyId: 'key-55' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apiKeyId: 'key-55' }),
        }),
      );
    });
  });
});
