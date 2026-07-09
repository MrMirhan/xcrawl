import { ExtractProcessor } from '../extract.processor';

const mockScrapeResult = {
  markdown: '# Product Page',
  html: '<h1>Product Page</h1>',
  metadata: { title: 'Product Page' },
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
};

const mockLlmService = {
  extract: jest.fn(),
};

function buildBullJob(data: Record<string, unknown>) {
  return { data } as any;
}

describe('ExtractProcessor', () => {
  let processor: ExtractProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ExtractProcessor(
      mockCrawlerEngineService as any,
      mockPrismaService as any,
      mockLlmService as any,
    );
  });

  describe('process', () => {
    const jobId = 'extract-job-1';
    const urls = ['https://example.com/a', 'https://example.com/b'];
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const prompt = 'Extract product name';
    const jobRecord = { userId: 'user-1' };

    beforeEach(() => {
      mockPrismaService.job.update.mockResolvedValue({});
      mockPrismaService.job.findUnique.mockResolvedValue(jobRecord);
      mockCrawlerEngineService.instance.scrape.mockResolvedValue(mockScrapeResult);
      mockLlmService.extract.mockResolvedValue({ name: 'Product A' });
      mockPrismaService.jobResult.create.mockResolvedValue({});
    });

    it('marks job as RUNNING at the start of processing', async () => {
      const job = buildBullJob({ jobId, urls, schema, prompt });

      await processor.process(job);

      expect(mockPrismaService.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
    });

    it('sets startedAt when marking job as RUNNING', async () => {
      const job = buildBullJob({ jobId, urls, schema, prompt });

      await processor.process(job);

      expect(mockPrismaService.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startedAt: expect.any(Date) }),
        }),
      );
    });

    it('looks up the job record by jobId to get the userId', async () => {
      const job = buildBullJob({ jobId, urls, schema, prompt });

      await processor.process(job);

      expect(mockPrismaService.job.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: jobId }, select: { userId: true } }),
      );
    });

    describe('successful processing', () => {
      it('scrapes each URL with markdown and html formats', async () => {
        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        expect(mockCrawlerEngineService.instance.scrape).toHaveBeenCalledTimes(2);
        expect(mockCrawlerEngineService.instance.scrape).toHaveBeenCalledWith(
          expect.objectContaining({ url: urls[0], formats: ['markdown', 'html'] }),
        );
        expect(mockCrawlerEngineService.instance.scrape).toHaveBeenCalledWith(
          expect.objectContaining({ url: urls[1], formats: ['markdown', 'html'] }),
        );
      });

      it('calls LLM extract with markdown content and schema/prompt', async () => {
        const job = buildBullJob({ jobId, urls: [urls[0]], schema, prompt });

        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith(
          mockScrapeResult.markdown,
          expect.objectContaining({ schema, prompt, userId: jobRecord.userId }),
        );
      });

      it('creates a jobResult for each successfully processed URL', async () => {
        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        expect(mockPrismaService.jobResult.create).toHaveBeenCalledTimes(2);
        expect(mockPrismaService.jobResult.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              jobId,
              url: urls[0],
              markdown: mockScrapeResult.markdown,
              extractedData: { name: 'Product A' },
            }),
          }),
        );
      });

      it('marks job as COMPLETED when all URLs succeed', async () => {
        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate).toMatchObject({
          where: { id: jobId },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        });
      });

      it('sets resultCount to the number of successfully processed URLs', async () => {
        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.resultCount).toBe(2);
      });

      it('sets no error field when all URLs succeed', async () => {
        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.error).toBeUndefined();
      });
    });

    describe('partial failure', () => {
      it('marks job as PARTIAL when some URLs fail', async () => {
        mockCrawlerEngineService.instance.scrape
          .mockResolvedValueOnce(mockScrapeResult)
          .mockRejectedValueOnce(new Error('Scrape failed'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.status).toBe('PARTIAL');
      });

      it('records a partial result with error metadata for the failed URL', async () => {
        mockCrawlerEngineService.instance.scrape
          .mockResolvedValueOnce(mockScrapeResult)
          .mockRejectedValueOnce(new Error('Scrape failed'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        // One success + one error result = 2 creates total
        expect(mockPrismaService.jobResult.create).toHaveBeenCalledTimes(2);
        // The failed URL should be recorded with error metadata
        expect(mockPrismaService.jobResult.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              url: urls[1],
              metadata: { error: 'Scrape failed' },
            }),
          }),
        );
      });

      it('sets resultCount to the count of successful URLs only', async () => {
        mockCrawlerEngineService.instance.scrape
          .mockResolvedValueOnce(mockScrapeResult)
          .mockRejectedValueOnce(new Error('Scrape failed'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.resultCount).toBe(1);
      });

      it('records error messages in the error field', async () => {
        mockCrawlerEngineService.instance.scrape
          .mockResolvedValueOnce(mockScrapeResult)
          .mockRejectedValueOnce(new Error('Scrape failed'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.error).toContain('Scrape failed');
      });
    });

    describe('all URLs fail', () => {
      it('marks job as FAILED when all URLs fail', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(new Error('Network error'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.status).toBe('FAILED');
      });

      it('sets resultCount to 0 when all URLs fail', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(new Error('Network error'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        const lastUpdate = mockPrismaService.job.update.mock.calls.at(-1)[0];
        expect(lastUpdate.data.resultCount).toBe(0);
      });

      it('still creates error results for each failed URL', async () => {
        mockCrawlerEngineService.instance.scrape.mockRejectedValue(new Error('Network error'));

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        expect(mockPrismaService.jobResult.create).toHaveBeenCalledTimes(2);
      });
    });

    describe('null jobRecord (job not found in database)', () => {
      it('returns early without processing any URLs when jobRecord is null', async () => {
        mockPrismaService.job.findUnique.mockResolvedValue(null);

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        expect(mockCrawlerEngineService.instance.scrape).not.toHaveBeenCalled();
        expect(mockLlmService.extract).not.toHaveBeenCalled();
      });

      it('does not create any results when jobRecord is null', async () => {
        mockPrismaService.job.findUnique.mockResolvedValue(null);

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        expect(mockPrismaService.jobResult.create).not.toHaveBeenCalled();
      });

      it('does not update final status when jobRecord is null', async () => {
        mockPrismaService.job.findUnique.mockResolvedValue(null);

        const job = buildBullJob({ jobId, urls, schema, prompt });

        await processor.process(job);

        // Only the initial RUNNING update should have been called
        expect(mockPrismaService.job.update).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.job.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) }),
        );
      });
    });

    describe('LLM content fallback', () => {
      it('falls back to html when markdown is not available', async () => {
        mockCrawlerEngineService.instance.scrape.mockResolvedValue({
          markdown: null,
          html: '<h1>Product</h1>',
          metadata: {},
        });

        const job = buildBullJob({ jobId, urls: [urls[0]], schema, prompt });

        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith(
          '<h1>Product</h1>',
          expect.any(Object),
        );
      });

      it('passes empty string to LLM when both markdown and html are unavailable', async () => {
        mockCrawlerEngineService.instance.scrape.mockResolvedValue({
          markdown: null,
          html: null,
          metadata: {},
        });

        const job = buildBullJob({ jobId, urls: [urls[0]], schema, prompt });

        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith('', expect.any(Object));
      });

      it('falls back to html when markdown is an empty string', async () => {
        mockCrawlerEngineService.instance.scrape.mockResolvedValue({
          markdown: '',
          html: '<h1>Product</h1>',
          metadata: {},
        });

        const job = buildBullJob({ jobId, urls: [urls[0]], schema, prompt });

        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith(
          '<h1>Product</h1>',
          expect.any(Object),
        );
      });

      it('uses markdown directly when it has real content', async () => {
        mockCrawlerEngineService.instance.scrape.mockResolvedValue({
          markdown: '# Product Page',
          html: '<h1>Product Page</h1>',
          metadata: {},
        });

        const job = buildBullJob({ jobId, urls: [urls[0]], schema, prompt });

        await processor.process(job);

        expect(mockLlmService.extract).toHaveBeenCalledWith(
          '# Product Page',
          expect.any(Object),
        );
      });
    });
  });
});
