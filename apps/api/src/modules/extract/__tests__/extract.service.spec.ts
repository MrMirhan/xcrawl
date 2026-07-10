import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ExtractService } from '../extract.service';

// Mock assertPublicUrl so tests don't perform real DNS lookups
jest.mock('../../../common/utils/url-validator', () => ({
  assertPublicUrl: jest.fn(),
}));

import { assertPublicUrl } from '../../../common/utils/url-validator';

const mockAssertPublicUrl = assertPublicUrl as jest.MockedFunction<typeof assertPublicUrl>;

const mockPrismaService = {
  job: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockExtractQueue = {
  add: jest.fn(),
};

const mockUsageService = {
  assertWithinQuota: jest.fn().mockResolvedValue(undefined),
};

describe('ExtractService', () => {
  let service: ExtractService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertPublicUrl.mockResolvedValue(undefined);
    mockUsageService.assertWithinQuota.mockResolvedValue(undefined);
    service = new ExtractService(mockExtractQueue as any, mockPrismaService as any, mockUsageService as any);
  });

  describe('startExtract', () => {
    const dto = {
      urls: ['https://example.com/a', 'https://example.com/b'],
      prompt: 'Extract product names',
    };
    const createdJob = { id: 'extract-job-1' };

    beforeEach(() => {
      mockPrismaService.job.create.mockResolvedValue(createdJob);
      mockExtractQueue.add.mockResolvedValue({});
    });

    it('creates a job record with type EXTRACT', async () => {
      await service.startExtract(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'EXTRACT' }),
        }),
      );
    });

    it('stores the urls array on the job', async () => {
      await service.startExtract(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ urls: dto.urls }),
        }),
      );
    });

    it('stores apiKeyId and userId on the created job', async () => {
      await service.startExtract(dto as any, 'key-1', 'user-1');

      expect(mockPrismaService.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiKeyId: 'key-1', userId: 'user-1' }),
        }),
      );
    });

    it('enqueues the job to the extract queue with event name "extract"', async () => {
      await service.startExtract(dto as any, 'key-1', 'user-1');

      expect(mockExtractQueue.add).toHaveBeenCalledWith(
        'extract',
        expect.objectContaining({ jobId: createdJob.id }),
      );
    });

    it('returns { success: true, id } after enqueueing', async () => {
      const result = await service.startExtract(dto as any, 'key-1', 'user-1');

      expect(result).toEqual({ success: true, id: createdJob.id });
    });

    it('works without apiKeyId and userId', async () => {
      const result = await service.startExtract(dto as any);

      expect(result).toEqual({ success: true, id: createdJob.id });
    });

    describe('SSRF validation', () => {
      it('calls assertPublicUrl for every url in the array', async () => {
        await service.startExtract(dto as any, 'key-1', 'user-1');

        for (const url of dto.urls) {
          expect(mockAssertPublicUrl).toHaveBeenCalledWith(url);
        }
      });

      it('rejects a private target url before enqueueing', async () => {
        const privateDto = { urls: ['http://127.0.0.1/'], prompt: 'Extract' };
        mockAssertPublicUrl.mockRejectedValue(
          new BadRequestException('Access to private IP addresses is not allowed'),
        );

        await expect(service.startExtract(privateDto as any)).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.job.create).not.toHaveBeenCalled();
        expect(mockExtractQueue.add).not.toHaveBeenCalled();
      });
    });

    describe('usage quota enforcement', () => {
      it('calls assertWithinQuota with EXTRACT pool and userId before enqueueing', async () => {
        await service.startExtract(dto as any, 'key-1', 'user-1');

        expect(mockUsageService.assertWithinQuota).toHaveBeenCalledWith('user-1', 'EXTRACT');
      });

      it('rejects the request when assertWithinQuota throws, before any queue/DB write', async () => {
        const { ForbiddenException } = await import('@nestjs/common');
        mockUsageService.assertWithinQuota.mockRejectedValue(
          new ForbiddenException('Daily EXTRACT limit reached'),
        );

        await expect(service.startExtract(dto as any, 'key-1', 'user-1')).rejects.toThrow(
          ForbiddenException,
        );

        expect(mockPrismaService.job.create).not.toHaveBeenCalled();
        expect(mockExtractQueue.add).not.toHaveBeenCalled();
      });
    });
  });

  describe('getExtractStatus', () => {
    const auth = { userId: 'user-1' };
    const mockJob = {
      id: 'extract-job-1',
      status: 'COMPLETED',
      config: { urls: ['https://example.com/a', 'https://example.com/b'] },
      results: [
        { url: 'https://example.com/a', markdown: '# Title A', extractedData: { name: 'Product A' }, metadata: {} },
        { url: 'https://example.com/b', markdown: '# Title B', extractedData: { name: 'Product B' }, metadata: {} },
      ],
    };

    it('returns job id, status, completed count, and total', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getExtractStatus('extract-job-1', auth);

      expect(result).toMatchObject({
        id: mockJob.id,
        status: mockJob.status,
        completed: 2,
        total: 2,
      });
    });

    it('maps results to url, markdown, and extractedData fields', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      const result = await service.getExtractStatus('extract-job-1', auth);

      expect(result.data).toEqual([
        { url: 'https://example.com/a', markdown: '# Title A', extractedData: { name: 'Product A' } },
        { url: 'https://example.com/b', markdown: '# Title B', extractedData: { name: 'Product B' } },
      ]);
    });

    it('returns total 0 when config has no urls', async () => {
      const jobWithNoUrls = { ...mockJob, config: {} };
      mockPrismaService.job.findFirst.mockResolvedValue(jobWithNoUrls);

      const result = await service.getExtractStatus('extract-job-1', auth);

      expect(result.total).toBe(0);
    });

    it('uses ownedWhere scoping when querying the job', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getExtractStatus('extract-job-1', { apiKeyId: 'key-77' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apiKeyId: 'key-77', id: 'extract-job-1' }),
        }),
      );
    });

    it('includes results in the query with select fields', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);

      await service.getExtractStatus('extract-job-1', auth);

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ results: expect.any(Object) }),
        }),
      );
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.getExtractStatus('nonexistent', auth)).rejects.toThrow(NotFoundException);
      await expect(service.getExtractStatus('nonexistent', auth)).rejects.toThrow('Job not found');
    });
  });

  describe('cancelExtract', () => {
    const auth = { userId: 'user-1' };
    const mockJob = { id: 'extract-job-1' };

    beforeEach(() => {
      mockPrismaService.job.findFirst.mockResolvedValue(mockJob);
      mockPrismaService.job.update.mockResolvedValue({});
    });

    it('updates job status to CANCELLED', async () => {
      await service.cancelExtract('extract-job-1', auth);

      expect(mockPrismaService.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'extract-job-1' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('sets completedAt when cancelling', async () => {
      await service.cancelExtract('extract-job-1', auth);

      expect(mockPrismaService.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ completedAt: expect.any(Date) }),
        }),
      );
    });

    it('returns { success: true } on successful cancel', async () => {
      const result = await service.cancelExtract('extract-job-1', auth);

      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when job does not exist', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.cancelExtract('nonexistent', auth)).rejects.toThrow(NotFoundException);
    });

    it('does not update the job when ownership check fails (job not found)', async () => {
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await expect(service.cancelExtract('nonexistent', auth)).rejects.toThrow();
      expect(mockPrismaService.job.update).not.toHaveBeenCalled();
    });

    it('uses ownedWhere scoping when looking up the job', async () => {
      await service.cancelExtract('extract-job-1', { userId: 'user-99' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-99' }),
        }),
      );
    });
  });
});
