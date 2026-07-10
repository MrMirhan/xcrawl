import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ExtractRequestDto } from './dto/extract-request.dto';
import { QUEUES, UsagePool } from '@xcrawl/shared';
import { ownedWhere } from '../../common/utils/ownership';
import { assertPublicUrl } from '../../common/utils/url-validator';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class ExtractService {
  private readonly logger = new Logger(ExtractService.name);

  constructor(
    @InjectQueue(QUEUES.EXTRACT) private extractQueue: Queue,
    private prisma: PrismaService,
    private usageService: UsageService,
  ) {}

  async startExtract(dto: ExtractRequestDto, apiKeyId?: string, userId?: string) {
    await Promise.all(
      dto.urls.map(async (url) => {
        try {
          await assertPublicUrl(url);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid URL';
          throw new BadRequestException(`${url}: ${message}`);
        }
      }),
    );

    await this.usageService.assertWithinQuota(userId, UsagePool.EXTRACT);

    const job = await this.prisma.job.create({
      data: {
        type: 'EXTRACT',
        urls: dto.urls,
        config: dto as object,
        apiKeyId,
        userId,
      },
    });

    await this.extractQueue.add('extract', {
      jobId: job.id,
      ...dto,
    });

    return { success: true, id: job.id };
  }

  async getExtractStatus(id: string, auth: { userId?: string; apiKeyId?: string } = {}) {
    const job = await this.prisma.job.findFirst({
      where: ownedWhere(id, auth),
      include: {
        results: {
          select: { url: true, markdown: true, extractedData: true, metadata: true },
        },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    return {
      id: job.id,
      status: job.status,
      completed: job.results.length,
      total: (job.config as { urls?: string[] })?.urls?.length ?? 0,
      data: job.results.map((r: { url: string; markdown: string | null; extractedData: unknown }) => ({
        url: r.url,
        markdown: r.markdown,
        extractedData: r.extractedData,
      })),
    };
  }

  async cancelExtract(id: string, auth: { userId?: string; apiKeyId?: string } = {}) {
    const job = await this.prisma.job.findFirst({ where: ownedWhere(id, auth) });
    if (!job) throw new NotFoundException('Job not found');

    await this.prisma.job.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    return { success: true };
  }
}
