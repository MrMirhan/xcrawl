import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ownedWhere } from '../../common/utils/ownership';

type Auth = { userId?: string; apiKeyId?: string };

@Injectable()
export class JobService {
  constructor(private prisma: PrismaService) {}

  async listJobs(options: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    userId?: string;
    apiKeyId?: string;
  }) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (options.type) where.type = options.type;
    if (options.status) where.status = options.status;
    // Scope by ownership
    if (options.userId) where.userId = options.userId;
    else if (options.apiKeyId) where.apiKeyId = options.apiKeyId;

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          url: true,
          resultCount: true,
          error: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: jobs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getJob(id: string, auth: Auth = {}) {
    const job = await this.prisma.job.findFirst({
      where: ownedWhere(id, auth),
      include: {
        results: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        _count: { select: { results: true } },
      },
    });

    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async getJobResults(id: string, page = 1, limit = 20, auth: Auth = {}) {
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

  async getStats(auth: Auth = {}) {
    const where: Record<string, unknown> = {};
    if (auth.userId) where.userId = auth.userId;
    else if (auth.apiKeyId) where.apiKeyId = auth.apiKeyId;

    const [total, completed, failed, running] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.job.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.job.count({ where: { ...where, status: 'RUNNING' } }),
    ]);

    return {
      total,
      completed,
      failed,
      running,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}
