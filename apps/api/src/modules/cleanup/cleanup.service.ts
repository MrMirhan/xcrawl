import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';

/**
 * Cleans up old job results and storage files.
 * Runs as a cron job, configurable via CLEANUP_TTL_HOURS env var.
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly ttlHours: number;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {
    this.ttlHours = parseInt(this.config.get('CLEANUP_TTL_HOURS', '168'), 10); // 7 days default
  }

  /**
   * Run cleanup every hour — removes jobs older than TTL.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    const cutoff = new Date(Date.now() - this.ttlHours * 60 * 60 * 1000);

    this.logger.log(`Running cleanup for jobs older than ${cutoff.toISOString()}`);

    try {
      // Find old completed/failed jobs
      const oldJobs = await this.prisma.job.findMany({
        where: {
          completedAt: { lt: cutoff },
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
        },
        select: { id: true },
      });

      if (oldJobs.length === 0) {
        this.logger.debug('No old jobs to clean up');
        return;
      }

      const jobIds = oldJobs.map((j: { id: string }) => j.id);

      // Delete screenshot files
      for (const jobId of jobIds) {
        try {
          await this.storage.deleteDirectory(`screenshots/${jobId}`);
        } catch {
          // File might not exist
        }
      }

      // Delete webhook deliveries
      await this.prisma.webhookDelivery.deleteMany({
        where: { jobId: { in: jobIds } },
      });

      // Delete job results
      await this.prisma.jobResult.deleteMany({
        where: { jobId: { in: jobIds } },
      });

      // Delete jobs
      const deleted = await this.prisma.job.deleteMany({
        where: { id: { in: jobIds } },
      });

      this.logger.log(`Cleaned up ${deleted.count} old jobs`);
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error}`);
    }
  }

  /**
   * Get cleanup stats
   */
  async getStats() {
    const cutoff = new Date(Date.now() - this.ttlHours * 60 * 60 * 1000);

    const [totalJobs, oldJobs, totalResults] = await Promise.all([
      this.prisma.job.count(),
      this.prisma.job.count({
        where: {
          completedAt: { lt: cutoff },
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
        },
      }),
      this.prisma.jobResult.count(),
    ]);

    return {
      totalJobs,
      oldJobsPendingCleanup: oldJobs,
      totalResults,
      ttlHours: this.ttlHours,
      nextCleanup: 'Every hour',
    };
  }
}
