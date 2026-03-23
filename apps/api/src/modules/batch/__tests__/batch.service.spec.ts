import { NotFoundException } from '@nestjs/common';
import { BatchService } from '../batch.service';

const mockPrismaService = {
  job: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockBatchQueue = {
  add: jest.fn(),
};

describe('BatchService', () => {
  let service: BatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatchService(mockBatchQueue as any, mockPrismaService as any);
  });

  describe('startBatch', () => {
    const dto = {
      urls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
    };
    const createdJob = { id: 'batch-job-1' };

    beforeEach(() => {
      mockPrismaService.job.create.mockResolvedValue(createdJob);
      mockBatchQueue.add.mockResolvedValue({});
    });

    it('creates a job record with type BATCH_SCRAPE', async () => {
      await service.startBatch(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'BATCH_SCRAPE' }),
        }),
      );
    });

    it('stores the urls array on the job', async () => {
      await service.startBatch(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ urls: dto.urls }),
        }),
      );
    });

    it('stores apiKeyId and userId on the created job', async () => {
      await service.startBatch(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiKeyId: 'key-1', userId: 'user-1' }),
        }),
      );
    });

    it('enqueues the job with event name "batch-scrape"', async () => {
      await service.startBatch(dto as any, 'key-1', 'user-1');

      expect(mockBatchQueue.add).toHaveBeenCalledWith(
        'batch-scrape',
        expect.objectContaining({ jobId: createdJob.id }),
      );
    });

    it('returns { success: true, id } after enqueueing', async () => {
      const result = await service.startBatch(dto as any, 'key-1', 'user-1');

      expect(result).toEqual({ success: true, id: createdJob.id });
    });

    it('works without apiKeyId and userId', async () => {
      const result = await service.startBatch(dto as any);

      expect(result).toEqual({ success: true, id: createdJob.id });
      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiKeyId: undefined, userId: undefined }),
        }),
      );
    });
  });

  describe('getBatchStatus', () => {
    const auth = { userId: 'user-1' };
    const mockJob = {
      id: 'batch-job-1',
      status: 'RUNNING',
      urls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
      results: [
        { url: 'https://example.com/a', markdown: '# A', statusCode: 200, metadata: {} },
      ],
      _count: { results: 1 },
    };

    it('returns job id, status, completed count, and total url count', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getBatchStatus('batch-job-1', auth);

      expect(result).toMatchObject({
        id: mockJob.id,
        status: mockJob.status,
        completed: 1,
        total: 3,
        data: mockJob.results,
      });
    });

    it('calculates total from the urls array length', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getBatchStatus('batch-job-1', auth);

      expect(result.total).toBe(mockJob.urls.length);
    });

    it('uses ownedWhere scoping when querying the job (userId)', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getBatchStatus('batch-job-1', { userId: 'user-42' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-42', id: 'batch-job-1' }),
        }),
      );
    });

    it('uses ownedWhere scoping when querying the job (apiKeyId)', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getBatchStatus('batch-job-1', { apiKeyId: 'key-88' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apiKeyId: 'key-88', id: 'batch-job-1' }),
        }),
      );
    });

    it('includes results and _count in the query', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getBatchStatus('batch-job-1', auth);

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            results: expect.any(Object),
            _count: expect.any(Object),
          }),
        }),
      );
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.getBatchStatus('nonexistent', auth)).rejects.toThrow(NotFoundException);
      await expect(service.getBatchStatus('nonexistent', auth)).rejects.toThrow('Job not found');
    });

    it('uses completed count from _count.results, not results array length', async () => {
      const jobWithDifferentCount = {
        ...mockJob,
        results: [], // empty results array
        _count: { results: 5 }, // but _count says 5
      };
      mockPrismaService.job.findFirst.mockResolvedValue(jobWithDifferentCount);

      const result = await service.getBatchStatus('batch-job-1', auth);

      expect(result.completed).toBe(5);
    });
  });
});
