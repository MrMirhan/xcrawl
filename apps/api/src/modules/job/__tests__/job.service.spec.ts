import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JobService } from '../job.service';

const mockPrismaService = {
  job: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  jobResult: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('JobService', () => {
  let service: JobService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JobService(mockPrismaService as any);
  });

  describe('listJobs', () => {
    const mockJobs = [
      { id: 'job-1', type: 'SCRAPE', status: 'COMPLETED', url: 'https://example.com' },
      { id: 'job-2', type: 'CRAWL', status: 'RUNNING', url: 'https://other.com' },
    ];

    beforeEach(() => {
      mockPrismaService.job.findMany.mockResolvedValue(mockJobs);
      mockPrismaService.job.count.mockResolvedValue(2);
    });

    it('scopes query by userId when userId is provided', async () => {
      await service.listJobs({ userId: 'user-123' });

      expect(mockPrismaService.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123' }),
        }),
      );
    });

    it('scopes query by apiKeyId when only apiKeyId is provided', async () => {
      await service.listJobs({ apiKeyId: 'key-abc' });

      expect(mockPrismaService.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apiKeyId: 'key-abc' }),
        }),
      );
    });

    it('does not add apiKeyId to where clause when userId is also present', async () => {
      await service.listJobs({ userId: 'user-123', apiKeyId: 'key-abc' });

      const callArgs = mockPrismaService.job.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('apiKeyId');
      expect(callArgs.where).toHaveProperty('userId', 'user-123');
    });

    it('returns paginated data with default page 1 and limit 20', async () => {
      const result = await service.listJobs({});

      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('respects custom page and limit', async () => {
      mockPrismaService.job.count.mockResolvedValue(100);
      mockPrismaService.job.findMany.mockResolvedValue(mockJobs);

      const result = await service.listJobs({ page: 3, limit: 10 });

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.totalPages).toBe(10);

      expect(mockPrismaService.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('filters by type when provided', async () => {
      await service.listJobs({ type: 'SCRAPE' });

      expect(mockPrismaService.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'SCRAPE' }),
        }),
      );
    });

    it('filters by status when provided', async () => {
      await service.listJobs({ status: 'COMPLETED' });

      expect(mockPrismaService.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('returns the job data array', async () => {
      const result = await service.listJobs({});
      expect(result.data).toEqual(mockJobs);
    });

    it('calculates totalPages correctly for partial last page', async () => {
      mockPrismaService.job.count.mockResolvedValue(21);
      const result = await service.listJobs({ limit: 20 });
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('getJob', () => {
    const mockJob = {
      id: 'job-1',
      type: 'SCRAPE',
      status: 'COMPLETED',
      results: [],
      _count: { results: 0 },
    };

    it('calls findFirst with ownedWhere clause for userId', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getJob('job-1', { userId: 'user-123' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1', userId: 'user-123' },
        }),
      );
    });

    it('calls findFirst with ownedWhere clause for apiKeyId', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getJob('job-1', { apiKeyId: 'key-abc' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1', apiKeyId: 'key-abc' },
        }),
      );
    });

    it('returns the job when found', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getJob('job-1', { userId: 'user-123' });
      expect(result).toEqual(mockJob);
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.getJob('nonexistent-id', { userId: 'user-123' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getJob('nonexistent-id', { userId: 'user-123' })).rejects.toThrow(
        'Job not found',
      );
    });

    it('throws UnauthorizedException when no auth provided', async () => {
      await expect(service.getJob('job-1', {})).rejects.toThrow(UnauthorizedException);
    });

    it('includes results and result count in the response', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getJob('job-1', { userId: 'user-123' });

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

  describe('getJobResults', () => {
    const mockJob = { id: 'job-1' };
    const mockResults = [
      { id: 'result-1', jobId: 'job-1', markdown: 'content' },
      { id: 'result-2', jobId: 'job-1', markdown: 'more content' },
    ];

    beforeEach(() => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);
      mockPrismaService.jobResult.findMany.mockResolvedValue(mockResults);
      mockPrismaService.jobResult.count.mockResolvedValue(2);
    });

    it('verifies job ownership using ownedWhere before fetching results', async () => {
      await service.getJobResults('job-1', 1, 20, { userId: 'user-123' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1', userId: 'user-123' },
        }),
      );
    });

    it('throws NotFoundException when job not found (ownership check fails)', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(
        service.getJobResults('job-1', 1, 20, { userId: 'user-123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns paginated results', async () => {
      const result = await service.getJobResults('job-1', 1, 20, { userId: 'user-123' });

      expect(result.data).toEqual(mockResults);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('applies correct skip offset for pagination', async () => {
      await service.getJobResults('job-1', 2, 10, { userId: 'user-123' });

      expect(mockPrismaService.jobResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('scopes results by jobId', async () => {
      await service.getJobResults('job-1', 1, 20, { userId: 'user-123' });

      expect(mockPrismaService.jobResult.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId: 'job-1' },
        }),
      );
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      mockPrismaService.job.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80)  // completed
        .mockResolvedValueOnce(10)  // failed
        .mockResolvedValueOnce(5);  // running
    });

    it('scopes counts by userId when provided', async () => {
      await service.getStats({ userId: 'user-123' });

      const calls = mockPrismaService.job.count.mock.calls;
      calls.forEach((call: [{ where: Record<string, unknown> }]) => {
        expect(call[0].where).toMatchObject({ userId: 'user-123' });
      });
    });

    it('scopes counts by apiKeyId when only apiKeyId provided', async () => {
      await service.getStats({ apiKeyId: 'key-abc' });

      const calls = mockPrismaService.job.count.mock.calls;
      calls.forEach((call: [{ where: Record<string, unknown> }]) => {
        expect(call[0].where).toMatchObject({ apiKeyId: 'key-abc' });
      });
    });

    it('returns correct stats structure', async () => {
      const result = await service.getStats({ userId: 'user-123' });

      expect(result).toEqual({
        total: 100,
        completed: 80,
        failed: 10,
        running: 5,
        successRate: 80,
      });
    });

    it('returns successRate of 0 when total is 0', async () => {
      mockPrismaService.job.count
        .mockReset()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getStats({ userId: 'user-123' });
      expect(result.successRate).toBe(0);
    });

    it('rounds successRate to nearest integer', async () => {
      mockPrismaService.job.count
        .mockReset()
        .mockResolvedValueOnce(3)   // total
        .mockResolvedValueOnce(1)   // completed
        .mockResolvedValueOnce(1)   // failed
        .mockResolvedValueOnce(1);  // running

      const result = await service.getStats({ userId: 'user-123' });
      expect(result.successRate).toBe(Math.round((1 / 3) * 100));
    });

    it('uses no scope filter when no auth provided', async () => {
      await service.getStats({});

      const calls = mockPrismaService.job.count.mock.calls;
      // First call (total) should have empty where
      expect(calls[0][0].where).toEqual({});
    });
  });
});
