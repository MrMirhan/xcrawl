import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { QUEUES } from '@xcrawl/shared';
import * as crypto from 'crypto';
import { CronExpressionParser } from 'cron-parser';
import { assertPublicUrl } from '../../common/utils/url-validator';
import { ownedWhere } from '../../common/utils/ownership';

type Auth = { userId?: string; apiKeyId?: string };

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUES.SCRAPE) private scrapeQueue: Queue,
    @InjectQueue(QUEUES.CRAWL) private crawlQueue: Queue,
  ) {}

  private validateCron(cron: string) {
    try {
      CronExpressionParser.parse(cron);
    } catch {
      throw new BadRequestException(`Invalid cron expression: ${cron}`);
    }
  }

  async create(dto: CreateScheduleDto, auth: Auth = {}) {
    this.validateCron(dto.cron);
    if (dto.webhookUrl) await assertPublicUrl(dto.webhookUrl);
    const nextRun = this.getNextCronRun(dto.cron);
    return this.prisma.schedule.create({
      data: {
        name: dto.name,
        type: dto.type as 'SCRAPE' | 'CRAWL',
        cron: dto.cron,
        config: dto.config as object,
        enableChangeDetection: dto.enableChangeDetection ?? false,
        webhookUrl: dto.webhookUrl,
        nextRunAt: nextRun,
        userId: auth.userId,
      },
    });
  }

  async list(auth: Auth = {}) {
    const where: Record<string, unknown> = {};
    if (auth.userId) where.userId = auth.userId;
    else if (auth.apiKeyId) return []; // API-key-only callers without userId see nothing
    return this.prisma.schedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, auth: Auth = {}) {
    const schedule = await this.prisma.schedule.findFirst({
      where: ownedWhere(id, auth),
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  async update(id: string, data: { name?: string; cron?: string; config?: Record<string, unknown>; active?: boolean }, auth: Auth = {}) {
    const schedule = await this.prisma.schedule.findFirst({
      where: ownedWhere(id, auth),
    });
    if (!schedule) throw new NotFoundException('Schedule not found');

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.cron !== undefined) {
      this.validateCron(data.cron);
      updateData.cron = data.cron;
      updateData.nextRunAt = this.getNextCronRun(data.cron);
    }
    if (data.config !== undefined) updateData.config = data.config;
    if (data.active !== undefined) {
      updateData.active = data.active;
      if (data.active) updateData.nextRunAt = this.getNextCronRun(data.cron ?? schedule.cron);
    }

    return this.prisma.schedule.update({
      where: { id },
      data: updateData,
    });
  }

  async toggle(id: string, auth: Auth = {}) {
    const schedule = await this.prisma.schedule.findFirst({
      where: ownedWhere(id, auth),
    });
    if (!schedule) throw new NotFoundException('Schedule not found');

    return this.prisma.schedule.update({
      where: { id },
      data: {
        active: !schedule.active,
        nextRunAt: !schedule.active ? this.getNextCronRun(schedule.cron) : null,
      },
    });
  }

  async remove(id: string, auth: Auth = {}) {
    const schedule = await this.prisma.schedule.findFirst({
      where: ownedWhere(id, auth),
    });
    if (!schedule) throw new NotFoundException('Schedule not found');

    await this.prisma.schedule.delete({ where: { id } });
    return { success: true };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkSchedules() {
    const now = new Date();
    const dueSchedules = await this.prisma.schedule.findMany({
      where: {
        active: true,
        nextRunAt: { lte: now },
      },
    });

    for (const schedule of dueSchedules) {
      try {
        await this.executeSchedule(schedule);
      } catch (error) {
        this.logger.error(`Failed to execute schedule ${schedule.id}: ${error}`);
      }
    }
  }

  private async executeSchedule(schedule: {
    id: string;
    type: string;
    config: unknown;
    cron: string;
    userId: string | null;
    enableChangeDetection: boolean;
    lastContentHash: string | null;
    webhookUrl: string | null;
  }) {
    const config = schedule.config as Record<string, unknown>;
    this.logger.log(`Executing schedule ${schedule.id}: ${schedule.type}`);

    const job = await this.prisma.job.create({
      data: {
        type: schedule.type as 'SCRAPE' | 'CRAWL',
        url: config.url as string,
        config: config as object,
        userId: schedule.userId,
      },
    });

    const queue = schedule.type === 'SCRAPE' ? this.scrapeQueue : this.crawlQueue;
    await queue.add(schedule.type.toLowerCase(), {
      jobId: job.id,
      ...config,
    });

    await this.prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: new Date(),
        lastJobId: job.id,
        nextRunAt: this.getNextCronRun(schedule.cron),
        runCount: { increment: 1 },
      },
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkForChanges() {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        active: true,
        enableChangeDetection: true,
        lastJobId: { not: null },
      },
    });

    const jobIds = schedules.map((s) => s.lastJobId).filter(Boolean) as string[];
    if (jobIds.length === 0) return;

    const jobs = await this.prisma.job.findMany({
      where: { id: { in: jobIds }, status: 'COMPLETED' },
      include: { results: { select: { markdown: true }, take: 1 } },
    });
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    for (const schedule of schedules) {
      if (!schedule.lastJobId) continue;

      const job = jobMap.get(schedule.lastJobId);
      if (!job || job.results.length === 0) continue;

      const content = job.results[0].markdown ?? '';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      if (schedule.lastContentHash && schedule.lastContentHash !== hash) {
        this.logger.log(`Content changed for schedule ${schedule.id}!`);

        if (schedule.webhookUrl) {
          try {
            await assertPublicUrl(schedule.webhookUrl);
            await fetch(schedule.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'content.changed',
                scheduleId: schedule.id,
                jobId: schedule.lastJobId,
                previousHash: schedule.lastContentHash,
                newHash: hash,
              }),
              signal: AbortSignal.timeout(10_000),
            });
          } catch {
            this.logger.warn(`Failed to send change webhook for schedule ${schedule.id}`);
          }
        }
      }

      await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: { lastContentHash: hash },
      });
    }
  }

  private getNextCronRun(cronExpression: string): Date {
    try {
      const interval = CronExpressionParser.parse(cronExpression);
      return interval.next().toDate();
    } catch {
      this.logger.warn(`Invalid cron expression: ${cronExpression}, defaulting to 1 hour`);
      return new Date(Date.now() + 3600_000);
    }
  }
}
