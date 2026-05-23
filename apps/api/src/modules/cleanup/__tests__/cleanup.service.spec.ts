import { CleanupService } from '../cleanup.service';

const mockPrismaService = {
  job: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  jobResult: {
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  webhookDelivery: {
    deleteMany: jest.fn(),
  },
};

const mockStorageService = {
  deleteDirectory: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === 'CLEANUP_TTL_HOURS') return '168';
    return defaultValue;
  }),
};

describe('CleanupService', () => {
  let service: CleanupService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    jest.clearAllMocks();

    service = new CleanupService(
      mockPrismaService as never,
      mockStorageService as never,
      mockConfigService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('handleCleanup', () => {
    it('deletes results, webhook deliveries, and jobs when expired jobs are found', async () => {
      const oldJobs = [{ id: 'job-1' }, { id: 'job-2' }];
      mockPrismaService.job.findMany.mockResolvedValue(oldJobs);
      mockPrismaService.webhookDelivery.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.jobResult.deleteMany.mockResolvedValue({ count: 3 });
      mockPrismaService.job.deleteMany.mockResolvedValue({ count: 2 });
      mockStorageService.deleteDirectory.mockResolvedValue(undefined);

      await service.handleCleanup();

      const expectedCutoff = new Date('2026-01-01T00:00:00.000Z').getTime() - 168 * 60 * 60 * 1000;

      expect(mockPrismaService.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            completedAt: { lt: new Date(expectedCutoff) },
            status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
          }),
        }),
      );

      expect(mockStorageService.deleteDirectory).toHaveBeenCalledTimes(2);
      expect(mockStorageService.deleteDirectory).toHaveBeenCalledWith('screenshots/job-1');
      expect(mockStorageService.deleteDirectory).toHaveBeenCalledWith('screenshots/job-2');

      expect(mockPrismaService.webhookDelivery.deleteMany).toHaveBeenCalledWith({
        where: { jobId: { in: ['job-1', 'job-2'] } },
      });

      expect(mockPrismaService.jobResult.deleteMany).toHaveBeenCalledWith({
        where: { jobId: { in: ['job-1', 'job-2'] } },
      });

      expect(mockPrismaService.job.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['job-1', 'job-2'] } },
      });
    });

    it('skips all deletes when no expired jobs exist', async () => {
      mockPrismaService.job.findMany.mockResolvedValue([]);

      await service.handleCleanup();

      expect(mockPrismaService.jobResult.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaService.webhookDelivery.deleteMany).not.toHaveBeenCalled();
      expect(mockPrismaService.job.deleteMany).not.toHaveBeenCalled();
      expect(mockStorageService.deleteDirectory).not.toHaveBeenCalled();
    });

    it('swallows errors without re-throwing when prisma delete fails', async () => {
      mockPrismaService.job.findMany.mockResolvedValue([{ id: 'job-err' }]);
      mockStorageService.deleteDirectory.mockResolvedValue(undefined);
      mockPrismaService.webhookDelivery.deleteMany.mockRejectedValue(new Error('DB failure'));

      await expect(service.handleCleanup()).resolves.toBeUndefined();
    });

    it('continues when storage.deleteDirectory throws (file not found)', async () => {
      const oldJobs = [{ id: 'job-nofile' }];
      mockPrismaService.job.findMany.mockResolvedValue(oldJobs);
      mockStorageService.deleteDirectory.mockRejectedValue(new Error('ENOENT'));
      mockPrismaService.webhookDelivery.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.jobResult.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.job.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.handleCleanup()).resolves.toBeUndefined();
      expect(mockPrismaService.job.deleteMany).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns counts, ttlHours, and nextCleanup string', async () => {
      mockPrismaService.job.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(8);
      mockPrismaService.jobResult.count.mockResolvedValue(200);

      const result = await service.getStats();

      expect(result).toEqual({
        totalJobs: 50,
        oldJobsPendingCleanup: 8,
        totalResults: 200,
        ttlHours: 168,
        nextCleanup: 'Every hour',
      });
    });

    it('queries old jobs with the correct cutoff date based on TTL', async () => {
      mockPrismaService.job.count.mockResolvedValue(0);
      mockPrismaService.jobResult.count.mockResolvedValue(0);

      await service.getStats();

      const expectedCutoff = new Date('2026-01-01T00:00:00.000Z').getTime() - 168 * 60 * 60 * 1000;

      expect(mockPrismaService.job.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            completedAt: { lt: new Date(expectedCutoff) },
          }),
        }),
      );
    });
  });
});
