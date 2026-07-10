import { ScrapeProcessor } from '../scrape.processor';

const mockScrapeResult = {
  url: 'https://example.com',
  markdown: '# Example',
  html: '<h1>Example</h1>',
  rawHtml: '<html><body><h1>Example</h1></body></html>',
  text: 'Example',
  links: ['https://example.com/a'],
  images: [],
  statusCode: 200,
  screenshot: undefined as string | undefined,
  metadata: { title: 'Example', duration: 400 },
};

const mockCrawlerEngineService = {
  instance: {
    scrape: jest.fn(),
  },
};

const mockPrismaService = {
  job: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  jobResult: {
    create: jest.fn(),
  },
  usageEvent: {
    create: jest.fn(),
  },
};

const mockStorageService = {
  saveScreenshot: jest.fn(),
};

const mockLlmService = {
  extract: jest.fn(),
};

function buildBullJob(data: Record<string, unknown>) {
  return { data, id: 'bull-job-1', updateProgress: jest.fn() } as unknown as import('bullmq').Job;
}

describe('ScrapeProcessor', () => {
  let processor: ScrapeProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ScrapeProcessor(
      mockCrawlerEngineService as unknown as ConstructorParameters<typeof ScrapeProcessor>[0],
      mockPrismaService as unknown as ConstructorParameters<typeof ScrapeProcessor>[1],
      mockStorageService as unknown as ConstructorParameters<typeof ScrapeProcessor>[2],
      mockLlmService as unknown as ConstructorParameters<typeof ScrapeProcessor>[3],
    );
  });

  describe('process', () => {
    const jobId = 'scrape-job-1';
    const jobData = { jobId, url: 'https://example.com', formats: ['markdown'] };
    const jobRecord = { userId: 'user-1' };

    beforeEach(() => {
      mockPrismaService.job.update.mockResolvedValue({});
      mockPrismaService.job.findUnique.mockResolvedValue(jobRecord);
      mockCrawlerEngineService.instance.scrape.mockResolvedValue(mockScrapeResult);
      mockPrismaService.jobResult.create.mockResolvedValue({});
      mockPrismaService.usageEvent.create.mockResolvedValue({});
    });

    describe('status lifecycle', () => {
      it('marks job RUNNING before calling the engine', async () => {
        const engineOrder: string[] = [];
        mockPrismaService.job.update.mockImplementation((args: { data: { status?: string } }) => {
          if (args.data.status) engineOrder.push(args.data.status);
          return Promise.resolve({});
        });
        mockCrawlerEngineService.instance.scrape.mockImplementation(async () => {
          engineOrder.push('ENGINE');
          return mockScrapeResult;
        });

        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(engineOrder[0]).toBe('RUNNING');
        expect(engineOrder[1]).toBe('ENGINE');
      });

      it('sets startedAt when marking RUNNING', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockPrismaService.job.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: jobId },
            data: expect.objectContaining({ status: 'RUNNING', startedAt: expect.any(Date) }),
          }),
        );
      });

      it('marks job COMPLETED after successful engine call', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        const lastCall = mockPrismaService.job.update.mock.calls.at(-1)?.[0];
        expect(lastCall).toMatchObject({
          where: { id: jobId },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        });
      });

      it('sets completedAt on COMPLETED update', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        const lastCall = mockPrismaService.job.update.mock.calls.at(-1)?.[0];
        expect(lastCall.data.completedAt).toBeInstanceOf(Date);
      });

      it('sets resultCount to 1 on successful scrape', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        const lastCall = mockPrismaService.job.update.mock.calls.at(-1)?.[0];
        expect(lastCall.data.resultCount).toBe(1);
      });

      it('COMPLETED update happens after RUNNING update', async () => {
        const statuses: string[] = [];
        mockPrismaService.job.update.mockImplementation((args: { data: { status?: string } }) => {
          if (args.data.status) statuses.push(args.data.status);
          return Promise.resolve({});
        });

        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(statuses).toEqual(['RUNNING', 'COMPLETED']);
      });
    });

    describe('happy path', () => {
      it('calls engine.scrape with the scrape options from job data', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockCrawlerEngineService.instance.scrape).toHaveBeenCalledWith(
          expect.objectContaining({ url: jobData.url, formats: jobData.formats }),
        );
      });

      it('does not pass jobId to engine.scrape', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockCrawlerEngineService.instance.scrape).toHaveBeenCalledWith(
          expect.not.objectContaining({ jobId }),
        );
      });

      it('creates a jobResult with the scrape output', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockPrismaService.jobResult.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              jobId,
              url: mockScrapeResult.url,
              markdown: mockScrapeResult.markdown,
              statusCode: mockScrapeResult.statusCode,
            }),
          }),
        );
      });

      it('returns result including extractedData: undefined when no extract options given', async () => {
        const job = buildBullJob(jobData);
        const returned = await processor.process(job);

        expect(returned).toMatchObject(expect.objectContaining({ url: mockScrapeResult.url }));
      });
    });

    describe('failure path', () => {
      it('marks job FAILED when engine throws', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(new Error('Network error'));

        const job = buildBullJob(jobData);

        await expect(processor.process(job)).rejects.toThrow('Network error');

        const failCall = mockPrismaService.job.update.mock.calls.at(-1)?.[0];
        expect(failCall).toMatchObject({
          where: { id: jobId },
          data: expect.objectContaining({ status: 'FAILED', error: 'Network error' }),
        });
      });

      it('sets completedAt on FAILED update', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(new Error('Timeout'));

        const job = buildBullJob(jobData);

        await expect(processor.process(job)).rejects.toThrow();

        const failCall = mockPrismaService.job.update.mock.calls.at(-1)?.[0];
        expect(failCall.data.completedAt).toBeInstanceOf(Date);
      });

      it('re-throws the original error after marking FAILED', async () => {
        const originalError = new Error('Playwright crashed');
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(originalError);

        const job = buildBullJob(jobData);

        await expect(processor.process(job)).rejects.toThrow('Playwright crashed');
      });

      it('uses fallback error string for non-Error throws', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue('string-error');

        const job = buildBullJob(jobData);

        await expect(processor.process(job)).rejects.toBe('string-error');

        const failCall = mockPrismaService.job.update.mock.calls.at(-1)?.[0];
        expect(failCall.data.error).toBe('Unknown error');
      });

      it('RUNNING update happens before FAILED update', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(new Error('fail'));
        const statuses: string[] = [];
        mockPrismaService.job.update.mockImplementation((args: { data: { status?: string } }) => {
          if (args.data.status) statuses.push(args.data.status);
          return Promise.resolve({});
        });

        const job = buildBullJob(jobData);

        await expect(processor.process(job)).rejects.toThrow();

        expect(statuses).toEqual(['RUNNING', 'FAILED']);
      });
    });

    describe('screenshot handling', () => {
      it('saves screenshot and stores path in jobResult when screenshot data is present', async () => {
        mockCrawlerEngineService.instance.scrape.mockResolvedValue({
          ...mockScrapeResult,
          screenshot: 'base64data==',
        });
        mockStorageService.saveScreenshot.mockResolvedValue('/storage/screenshots/scrape-job-1.png');

        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockStorageService.saveScreenshot).toHaveBeenCalledWith(jobId, 'base64data==');
        expect(mockPrismaService.jobResult.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ screenshotPath: '/storage/screenshots/scrape-job-1.png' }),
          }),
        );
      });

      it('does not call saveScreenshot when screenshot is absent', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockStorageService.saveScreenshot).not.toHaveBeenCalled();
      });
    });

    describe('LLM extraction', () => {
      it('calls llm.extract when extractSchema is provided', async () => {
        const schema = { type: 'object', properties: { name: { type: 'string' } } };
        mockPrismaService.job.findUnique.mockResolvedValue(jobRecord);
        mockLlmService.extract.mockResolvedValue({ name: 'Example' });

        const job = buildBullJob({ ...jobData, extractSchema: schema });
        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith(
          mockScrapeResult.markdown,
          expect.objectContaining({ schema, userId: jobRecord.userId }),
        );
      });

      it('calls llm.extract when extractPrompt is provided', async () => {
        mockPrismaService.job.findUnique.mockResolvedValue(jobRecord);
        mockLlmService.extract.mockResolvedValue({ result: 'data' });

        const job = buildBullJob({ ...jobData, extractPrompt: 'Extract the title' });
        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith(
          mockScrapeResult.markdown,
          expect.objectContaining({ prompt: 'Extract the title' }),
        );
      });

      it('does not call llm.extract when no extract options are given', async () => {
        const job = buildBullJob(jobData);
        await processor.process(job);

        expect(mockLlmService.extract).not.toHaveBeenCalled();
      });

      it('stores extractedData in the returned result', async () => {
        const extractedData = { name: 'Test' };
        mockPrismaService.job.findUnique.mockResolvedValue(jobRecord);
        mockLlmService.extract.mockResolvedValue(extractedData);

        const job = buildBullJob({ ...jobData, extractPrompt: 'Extract name' });
        const returned = await processor.process(job);

        expect((returned as Record<string, unknown>).extractedData).toEqual(extractedData);
      });
    });
  });
});
