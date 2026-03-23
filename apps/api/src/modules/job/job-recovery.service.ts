import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '@xcrawl/shared';

/**
 * On startup, find jobs stuck in RUNNING state (from a previous server crash)
 * and re-enqueue them. For crawl jobs, adjusts maxPages to only crawl
 * remaining pages (resume behavior).
 */
@Injectable()
export class JobRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(JobRecoveryService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUES.SCRAPE) private scrapeQueue: Queue,
    @InjectQueue(QUEUES.CRAWL) private crawlQueue: Queue,
    @InjectQueue(QUEUES.BATCH_SCRAPE) private batchQueue: Queue,
    @InjectQueue(QUEUES.EXTRACT) private extractQueue: Queue,
  ) {}

  async onModuleInit() {
    const staleJobs = await this.prisma.job.findMany({
      where: { status: 'RUNNING' },
      select: { id: true, type: true, config: true, resultCount: true },
    });

    if (staleJobs.length === 0) return;

    this.logger.log(`Found ${staleJobs.length} stale RUNNING job(s) — recovering`);

    for (const job of staleJobs) {
      try {
        const config = job.config as Record<string, unknown>;
        const queue = this.getQueue(job.type);

        if (!queue) {
          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'FAILED', completedAt: new Date(), error: 'Server restarted, unknown job type' },
          });
          continue;
        }

        if (job.type === 'CRAWL' && job.resultCount > 0) {
          // Resume crawl: get already-crawled URLs to build an exclude list
          const completedUrls = await this.prisma.jobResult.findMany({
            where: { jobId: job.id },
            select: { url: true },
          });
          const doneUrls = completedUrls.map(r => r.url);

          // Reduce maxPages by what's already done
          const originalMax = (config.maxPages as number) ?? 100;
          const remaining = Math.max(1, originalMax - doneUrls.length);

          const resumeConfig = {
            ...config,
            maxPages: remaining,
            // Pass completed URLs so the crawler can skip them
            _excludeUrls: doneUrls,
          };

          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'PENDING', startedAt: null },
          });

          await queue.add('crawl', { jobId: job.id, ...resumeConfig });
          this.logger.log(`Resumed CRAWL job ${job.id}: ${doneUrls.length} pages done, ${remaining} remaining`);
        } else if (job.type === 'BATCH_SCRAPE' && job.resultCount > 0) {
          // Resume batch: only re-scrape URLs that don't have results yet
          const completedUrls = await this.prisma.jobResult.findMany({
            where: { jobId: job.id },
            select: { url: true },
          });
          const doneSet = new Set(completedUrls.map(r => r.url));
          const allUrls = (config.urls as string[]) ?? [];
          const remainingUrls = allUrls.filter(u => !doneSet.has(u));

          if (remainingUrls.length === 0) {
            await this.prisma.job.update({
              where: { id: job.id },
              data: { status: 'COMPLETED', completedAt: new Date() },
            });
            this.logger.log(`BATCH job ${job.id} was already complete — marking COMPLETED`);
            continue;
          }

          const resumeConfig = { ...config, urls: remainingUrls };
          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'PENDING', startedAt: null },
          });

          await queue.add('batch-scrape', { jobId: job.id, ...resumeConfig });
          this.logger.log(`Resumed BATCH job ${job.id}: ${doneSet.size} done, ${remainingUrls.length} remaining`);
        } else if (job.type === 'EXTRACT' && job.resultCount > 0) {
          // Resume extract: only process URLs without results
          const completedUrls = await this.prisma.jobResult.findMany({
            where: { jobId: job.id },
            select: { url: true },
          });
          const doneSet = new Set(completedUrls.map(r => r.url));
          const allUrls = (config.urls as string[]) ?? [];
          const remainingUrls = allUrls.filter(u => !doneSet.has(u));

          if (remainingUrls.length === 0) {
            await this.prisma.job.update({
              where: { id: job.id },
              data: { status: 'COMPLETED', completedAt: new Date() },
            });
            continue;
          }

          const resumeConfig = { ...config, urls: remainingUrls };
          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'PENDING', startedAt: null },
          });

          await queue.add('extract', { jobId: job.id, ...resumeConfig });
          this.logger.log(`Resumed EXTRACT job ${job.id}: ${doneSet.size} done, ${remainingUrls.length} remaining`);
        } else {
          // Simple restart (SCRAPE or jobs with 0 results)
          await this.prisma.jobResult.deleteMany({ where: { jobId: job.id } });
          await this.prisma.job.update({
            where: { id: job.id },
            data: { status: 'PENDING', startedAt: null, resultCount: 0 },
          });

          await queue.add(job.type.toLowerCase(), { jobId: job.id, ...config });
          this.logger.log(`Re-enqueued ${job.type} job ${job.id}`);
        }
      } catch (error) {
        this.logger.error(`Failed to recover job ${job.id}: ${error}`);
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'FAILED', completedAt: new Date(), error: 'Server restarted, recovery failed' },
        });
      }
    }
  }

  private getQueue(type: string): Queue | null {
    switch (type) {
      case 'SCRAPE': return this.scrapeQueue;
      case 'CRAWL': return this.crawlQueue;
      case 'BATCH_SCRAPE': return this.batchQueue;
      case 'EXTRACT': return this.extractQueue;
      default: return null;
    }
  }
}
