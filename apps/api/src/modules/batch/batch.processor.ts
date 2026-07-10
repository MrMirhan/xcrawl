import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobStatus } from '@xcrawl/db';
import { CrawlerEngineService } from '../crawler-engine/crawler-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { QUEUES, UsagePool } from '@xcrawl/shared';

const MAX_RETRIES = 2;

@Processor(QUEUES.BATCH_SCRAPE)
export class BatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchProcessor.name);

  constructor(
    private crawlerEngine: CrawlerEngineService,
    private prisma: PrismaService,
    private storage: StorageService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { jobId, urls, ...options } = job.data;
    this.logger.log(`Processing batch scrape job ${jobId} with ${urls.length} URLs`);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const jobRecord = await this.prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
    const jobUserId = jobRecord?.userId ?? undefined;

    let completed = 0;
    const errors: string[] = [];
    const timeout = options.timeout ?? 30_000;

    // Process URLs sequentially to avoid Crawlee storage conflicts
    // Each scrape creates its own crawler instance
    for (const url of urls as string[]) {
      let succeeded = false;

      for (let attempt = 0; attempt < MAX_RETRIES && !succeeded; attempt++) {
        try {
          if (attempt > 0) {
            this.logger.debug(`Retry ${attempt} for ${url}`);
          }

          const result = await this.crawlerEngine.instance.scrape({
            url,
            formats: options.formats,
            onlyMainContent: options.onlyMainContent ?? true,
            timeout,
            engine: options.engine,
          });

          let screenshotPath: string | undefined;
          if (result.screenshot) {
            screenshotPath = await this.storage.saveScreenshot(
              jobId,
              result.screenshot,
            );
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

          completed++;
          succeeded = true;

          await this.prisma.job.update({
            where: { id: jobId },
            data: { resultCount: completed },
          });

          if (jobUserId) {
            await this.prisma.usageEvent.create({ data: { userId: jobUserId, pool: UsagePool.PAGES, amount: 1 } });
          }

          this.logger.debug(`Batch ${jobId}: ${completed}/${urls.length} - ${url}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';

          if (attempt === MAX_RETRIES - 1) {
            // Final attempt failed
            errors.push(`${url}: ${msg}`);
            this.logger.warn(
              `Batch scrape ${jobId} permanently failed for ${url} after ${MAX_RETRIES} attempts: ${msg}`,
            );
          } else {
            this.logger.debug(
              `Batch scrape ${jobId} attempt ${attempt + 1} failed for ${url}: ${msg}`,
            );
            // Brief pause before retry
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    }

    let finalStatus: JobStatus;
    if (errors.length === urls.length) {
      finalStatus = JobStatus.FAILED;
    } else if (errors.length > 0) {
      finalStatus = JobStatus.PARTIAL;
    } else {
      finalStatus = JobStatus.COMPLETED;
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        error: errors.length > 0 ? errors.join('; ') : null,
        metadata: {
          totalUrls: urls.length,
          succeeded: completed,
          failed: errors.length,
        },
      },
    });

    this.logger.log(
      `Batch scrape ${jobId} finished: ${completed}/${urls.length} succeeded, status: ${finalStatus}`,
    );
  }
}
