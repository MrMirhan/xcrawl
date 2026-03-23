import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import pLimit from 'p-limit';
import { CrawlerEngineService } from '../crawler-engine/crawler-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WebhookService } from '../webhook/webhook.service';
import { CrawlGateway } from '../gateway/crawl.gateway';
import { LlmService } from '../extract/llm.service';
import { CrawlService } from './crawl.service';
import { QUEUES } from '@xcrawl/shared';
import type { ScrapeOutput } from '@xcrawl/crawler';

const LLM_CONCURRENCY = 5;

@Processor(QUEUES.CRAWL)
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(
    private crawlerEngine: CrawlerEngineService,
    private prisma: PrismaService,
    private storage: StorageService,
    private webhookService: WebhookService,
    private crawlGateway: CrawlGateway,
    private llm: LlmService,
    private crawlService: CrawlService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { jobId, extractSchema, extractPrompt, ...crawlOptions } = job.data;
    this.logger.log(`Processing crawl job ${jobId} for ${crawlOptions.url}`);

    const hasExtraction = !!(extractSchema || extractPrompt);

    // Job-local cancellation state — not shared with other concurrent jobs
    let cancelled = false;
    const cancelPollInterval = setInterval(() => {
      this.crawlService.isCancelled(jobId).then((is) => { if (is) cancelled = true; }).catch(() => undefined);
    }, 2000);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      // Phase 1: Crawl all pages
      await this.crawlerEngine.instance.crawl(crawlOptions, {
        onPageComplete: async (result: ScrapeOutput) => {
          let screenshotPath: string | undefined;
          if (result.screenshot) {
            screenshotPath = await this.storage.saveScreenshot(jobId, result.screenshot, result.url);
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
              metadata: result.metadata as object,
            },
          });

          await this.prisma.job.update({
            where: { id: jobId },
            data: { resultCount: { increment: 1 } },
          });

          this.crawlGateway.emitPageComplete(jobId, {
            url: result.url,
            statusCode: result.statusCode,
          });

          await this.webhookService.fireEvent('crawl.page', jobId, result);
        },

        onProgress: (completed, total, currentUrl) => {
          this.logger.debug(`Crawl ${jobId}: ${completed}/${total} - ${currentUrl}`);
          this.crawlGateway.emitProgress(jobId, { completed, total, currentUrl });
        },

        onError: (url, error) => {
          this.logger.warn(`Crawl ${jobId} error on ${url}: ${error.message}`);
        },

        isCancelled: () => cancelled,
      });

      // Phase 2: Run LLM extraction with bounded concurrency
      if (hasExtraction && !cancelled) {
        const jobRecord = await this.prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
        const results = await this.prisma.jobResult.findMany({
          where: { jobId },
          select: { id: true, markdown: true, text: true, html: true },
        });

        this.logger.log(`Running LLM extraction on ${results.length} pages for job ${jobId}`);

        const limit = pLimit(LLM_CONCURRENCY);
        await Promise.all(
          results.map((result) =>
            limit(async () => {
              if (cancelled) return;
              const content = result.markdown || result.text || result.html || '';
              if (!content) return;

              try {
                const extractedData = await this.llm.extract(content, {
                  schema: extractSchema,
                  prompt: extractPrompt,
                  userId: jobRecord?.userId ?? undefined,
                });

                await this.prisma.jobResult.update({
                  where: { id: result.id },
                  data: { extractedData: extractedData as object },
                });
              } catch (err) {
                this.logger.warn(`LLM extraction failed for result ${result.id}: ${err}`);
              }
            }),
          ),
        );
      }

      const finalStatus = cancelled ? 'CANCELLED' : 'COMPLETED';
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: finalStatus, completedAt: new Date() },
      });

      if (!cancelled) {
        this.crawlGateway.emitJobCompleted(jobId);
        await this.webhookService.fireEvent('crawl.completed', jobId);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Crawl job ${jobId} failed: ${errorMsg}`);

      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date(), error: errorMsg },
      });

      this.crawlGateway.emitJobFailed(jobId, errorMsg);
      await this.webhookService.fireEvent('job.failed', jobId, { error: errorMsg });
      throw error;
    } finally {
      clearInterval(cancelPollInterval);
    }
  }
}
