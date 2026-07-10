import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CrawlerEngineService } from '../crawler-engine/crawler-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LlmService } from '../extract/llm.service';
import { QUEUES, UsagePool } from '@xcrawl/shared';

@Processor(QUEUES.SCRAPE)
export class ScrapeProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapeProcessor.name);

  constructor(
    private crawlerEngine: CrawlerEngineService,
    private prisma: PrismaService,
    private storage: StorageService,
    private llm: LlmService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const { jobId, extractSchema, extractPrompt, ...scrapeOptions } = job.data;
    this.logger.log(`Processing scrape job ${jobId} for ${scrapeOptions.url}`);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const jobRecord = await this.prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
    const jobUserId = jobRecord?.userId ?? undefined;

    try {
      const result = await this.crawlerEngine.instance.scrape(scrapeOptions);

      let screenshotPath: string | undefined;
      if (result.screenshot) {
        screenshotPath = await this.storage.saveScreenshot(jobId, result.screenshot);
      }

      // Run LLM extraction if schema or prompt provided
      let extractedData: unknown = undefined;
      if (extractSchema || extractPrompt) {
        const content = result.markdown || result.text || result.html || '';
        if (content) {
          extractedData = await this.llm.extract(content, {
            schema: extractSchema,
            prompt: extractPrompt,
            userId: jobUserId,
          });
        }
      }

      await this.prisma.jobResult.create({
        data: {
          jobId,
          url: result.url,
          statusCode: result.statusCode,
          markdown: result.markdown,
          html: result.html,
          rawHtml: result.rawHtml,
          text: result.text,
          links: result.links ?? [],
          images: result.images ?? [],
          screenshotPath,
          extractedData: extractedData as object ?? undefined,
          metadata: result.metadata as object,
        },
      });

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          resultCount: 1,
          metadata: { duration: result.metadata.duration },
        },
      });

      if (jobUserId) {
        await this.prisma.usageEvent.create({ data: { userId: jobUserId, pool: UsagePool.PAGES, amount: 1 } });
      }

      return { ...result, extractedData };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Scrape job ${jobId} failed: ${errorMsg}`);

      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date(), error: errorMsg },
      });

      throw error;
    }
  }
}
