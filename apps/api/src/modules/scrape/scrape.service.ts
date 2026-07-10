import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ScrapeRequestDto } from './dto/scrape-request.dto';
import { QUEUES, UsagePool } from '@xcrawl/shared';
import { ConfigService } from '@nestjs/config';
import { assertPublicUrl } from '../../common/utils/url-validator';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class ScrapeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScrapeService.name);
  private queueEvents!: QueueEvents;

  constructor(
    @InjectQueue(QUEUES.SCRAPE) private scrapeQueue: Queue,
    private prisma: PrismaService,
    private cache: CacheService,
    private config: ConfigService,
    private usageService: UsageService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get('redis.url', 'redis://localhost:6379');
    this.queueEvents = new QueueEvents(QUEUES.SCRAPE, {
      connection: { url: redisUrl },
    });
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
  }

  async scrape(dto: ScrapeRequestDto, apiKeyId?: string, userId?: string) {
    await assertPublicUrl(dto.url);
    await this.usageService.assertWithinQuota(userId, UsagePool.PAGES);

    const formats = dto.formats ?? ['markdown'];
    const onlyMainContent = dto.onlyMainContent ?? true;

    // Check cache first (skip if actions or screenshot requested)
    const hasActions = dto.actions && dto.actions.length > 0;
    const wantsScreenshot = formats.includes('screenshot');

    if (!hasActions && !wantsScreenshot) {
      const cached = await this.cache.get(dto.url, formats, onlyMainContent);
      if (cached) {
        this.logger.debug(`Cache hit for ${dto.url}`);
        return { success: true, data: cached, cached: true };
      }
    }

    // Create job record
    const job = await this.prisma.job.create({
      data: {
        type: 'SCRAPE',
        url: dto.url,
        config: dto as object,
        apiKeyId,
        userId,
      },
    });

    // Enqueue to BullMQ
    const bullJob = await this.scrapeQueue.add('scrape', {
      jobId: job.id,
      ...dto,
    });

    try {
      // Wait for result (sync scrape)
      // Add extra buffer when LLM extraction is requested (it can take 60s+ on top of crawl time)
      const baseTimeout = dto.timeout ?? 30_000;
      const hasExtract = dto.extractPrompt || dto.extractSchema;
      // Playwright screenshots need more time (browser launch + render + capture)
      const extraBuffer = hasExtract ? 120_000 : wantsScreenshot ? 30_000 : 10_000;
      const waitTimeout = baseTimeout + extraBuffer;
      const result = await bullJob.waitUntilFinished(this.queueEvents, waitTimeout);

      // Cache the result (skip if it has screenshot data — too large)
      if (!wantsScreenshot && result) {
        await this.cache.set(dto.url, formats, onlyMainContent, result);
      }

      return { success: true, data: result };
    } catch (error) {
      this.logger.error(`Scrape failed for ${dto.url}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scrape failed',
      };
    }
  }
}
