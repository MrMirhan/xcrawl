import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BatchScrapeRequestDto } from './dto/batch-request.dto';
import { QUEUES } from '@xcrawl/shared';
import { ownedWhere } from '../../common/utils/ownership';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @InjectQueue(QUEUES.BATCH_SCRAPE) private batchQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async startBatch(dto: BatchScrapeRequestDto, apiKeyId?: string, userId?: string) {
    const job = await this.prisma.job.create({
      data: {
        type: 'BATCH_SCRAPE',
        urls: dto.urls,
        config: dto as object,
        apiKeyId,
        userId,
      },
    });

    await this.batchQueue.add('batch-scrape', {
      jobId: job.id,
      ...dto,
    });

    return { success: true, id: job.id };
  }

  async getBatchStatus(id: string, auth: { userId?: string; apiKeyId?: string } = {}) {
    const job = await this.prisma.job.findFirst({
      where: ownedWhere(id, auth),
      include: {
        results: {
          select: { url: true, markdown: true, statusCode: true, metadata: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { results: true } },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    return {
      id: job.id,
      status: job.status,
      completed: job._count.results,
      total: job.urls.length,
      data: job.results,
    };
  }
}
