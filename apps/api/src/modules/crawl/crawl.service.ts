import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CrawlRequestDto } from './dto/crawl-request.dto';
import { QUEUES } from '@xcrawl/shared';
import { ownedWhere } from '../../common/utils/ownership';
import { assertPublicUrl } from '../../common/utils/url-validator';

@Injectable()
export class CrawlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrawlService.name);
  private redis!: Redis;

  constructor(
    @InjectQueue(QUEUES.CRAWL) private crawlQueue: Queue,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.redis = new Redis(this.config.get<string>('redis.url', 'redis://localhost:6379'));
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  cancelKey(jobId: string) {
    return `crawl:cancel:${jobId}`;
  }

  async isCancelled(jobId: string): Promise<boolean> {
    return (await this.redis.exists(this.cancelKey(jobId))) === 1;
  }

  async startCrawl(dto: CrawlRequestDto, apiKeyId?: string, userId?: string) {
    await assertPublicUrl(dto.url);

    const job = await this.prisma.job.create({
      data: {
        type: 'CRAWL',
        url: dto.url,
        config: dto as object,
        apiKeyId,
        userId,
      },
    });

    await this.crawlQueue.add('crawl', {
      jobId: job.id,
      ...dto,
    });

    return { success: true, id: job.id };
  }

  async getCrawlStatus(id: string, auth: { userId?: string; apiKeyId?: string }) {
    const job = await this.prisma.job.findFirst({
      where: ownedWhere(id, auth),
      include: {
        results: {
          select: {
            url: true,
            markdown: true,
            html: true,
            links: true,
            images: true,
            statusCode: true,
            metadata: true,
            extractedData: true,
            screenshotPath: true,
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { results: true } },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    return {
      id: job.id,
      status: job.status,
      progress: {
        completed: job._count.results,
        total: (job.config as { maxPages?: number })?.maxPages ?? 100,
        currentUrl: job.url,
      },
      data: job.results,
    };
  }

  async getCrawlResults(id: string, page = 1, limit = 20, auth: { userId?: string; apiKeyId?: string } = {}) {
    const job = await this.prisma.job.findFirst({ where: ownedWhere(id, auth) });
    if (!job) throw new NotFoundException('Job not found');

    const [results, total] = await Promise.all([
      this.prisma.jobResult.findMany({
        where: { jobId: id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.jobResult.count({ where: { jobId: id } }),
    ]);

    return {
      data: results,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async cancelCrawl(id: string, auth: { userId?: string; apiKeyId?: string } = {}) {
    const job = await this.prisma.job.findFirst({ where: ownedWhere(id, auth) });
    if (!job) throw new NotFoundException('Job not found');

    await this.redis.set(this.cancelKey(id), '1', 'EX', 3600);

    await this.prisma.job.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    return { success: true };
  }
}
