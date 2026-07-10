import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { UsagePool, type UsageSummary, type EffectiveLimits } from '@xcrawl/shared';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePlanLimits } from './plan-resolver';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private prisma: PrismaService) {}

  async getEffectiveLimits(userId: string): Promise<EffectiveLimits> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, limitOverrides: true, canUseOwnLlmOverride: true },
    });

    return resolvePlanLimits({
      plan: user?.plan ?? null,
      limitOverrides: (user?.limitOverrides as Record<string, number | null> | null) ?? null,
      canUseOwnLlmOverride: user?.canUseOwnLlmOverride ?? null,
    });
  }

  async getUsage(userId: string): Promise<UsageSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: { select: { name: true, description: true } } },
    });

    const limits = await this.getEffectiveLimits(userId);

    const pools: UsagePool[] = [UsagePool.PAGES, UsagePool.SEARCH, UsagePool.EXTRACT];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const poolData = await Promise.all(
      pools.map(async (pool) => {
        const [dailyAgg, weeklyAgg] = await Promise.all([
          this.prisma.usageEvent.aggregate({
            _sum: { amount: true },
            where: { userId, pool, createdAt: { gte: oneDayAgo } },
          }),
          this.prisma.usageEvent.aggregate({
            _sum: { amount: true },
            where: { userId, pool, createdAt: { gte: sevenDaysAgo } },
          }),
        ]);

        return {
          pool,
          dailyUsed: dailyAgg._sum.amount ?? 0,
          weeklyUsed: weeklyAgg._sum.amount ?? 0,
        };
      }),
    );

    const summary: UsageSummary = {
      plan: user?.plan ?? null,
      pools: {} as UsageSummary['pools'],
    };

    for (const p of poolData) {
      if (p.pool === UsagePool.PAGES) {
        summary.pools[UsagePool.PAGES] = {
          dailyUsed: p.dailyUsed,
          dailyLimit: limits.dailyPageLimit,
          weeklyUsed: p.weeklyUsed,
          weeklyLimit: limits.weeklyPageLimit,
        };
      } else if (p.pool === UsagePool.SEARCH) {
        summary.pools[UsagePool.SEARCH] = {
          dailyUsed: p.dailyUsed,
          dailyLimit: limits.dailySearchLimit,
          weeklyUsed: p.weeklyUsed,
          weeklyLimit: limits.weeklySearchLimit,
        };
      } else {
        summary.pools[UsagePool.EXTRACT] = {
          dailyUsed: p.dailyUsed,
          dailyLimit: limits.dailyExtractLimit,
          weeklyUsed: p.weeklyUsed,
          weeklyLimit: limits.weeklyExtractLimit,
        };
      }
    }

    return summary;
  }

  async assertWithinQuota(userId: string | undefined, pool: UsagePool): Promise<void> {
    if (!userId) return;

    const limits = await this.getEffectiveLimits(userId);
    const dailyKey =
      pool === UsagePool.PAGES
        ? 'dailyPageLimit'
        : pool === UsagePool.SEARCH
          ? 'dailySearchLimit'
          : 'dailyExtractLimit';
    const weeklyKey =
      pool === UsagePool.PAGES
        ? 'weeklyPageLimit'
        : pool === UsagePool.SEARCH
          ? 'weeklySearchLimit'
          : 'weeklyExtractLimit';

    const dailyLimit = limits[dailyKey];
    const weeklyLimit = limits[weeklyKey];

    if (dailyLimit === null && weeklyLimit === null) return;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [dailyAgg, weeklyAgg] = await Promise.all([
      this.prisma.usageEvent.aggregate({
        _sum: { amount: true },
        where: { userId, pool, createdAt: { gte: oneDayAgo } },
      }),
      this.prisma.usageEvent.aggregate({
        _sum: { amount: true },
        where: { userId, pool, createdAt: { gte: sevenDaysAgo } },
      }),
    ]);

    const dailyUsed = dailyAgg._sum.amount ?? 0;
    const weeklyUsed = weeklyAgg._sum.amount ?? 0;

    if (dailyLimit !== null && dailyUsed >= dailyLimit) {
      throw new ForbiddenException(
        `Daily ${pool} limit reached (${dailyUsed}/${dailyLimit}). Resets on a rolling 24h basis.`,
      );
    }

    if (weeklyLimit !== null && weeklyUsed >= weeklyLimit) {
      throw new ForbiddenException(
        `Weekly ${pool} limit reached (${weeklyUsed}/${weeklyLimit}). Resets on a rolling 7-day basis.`,
      );
    }
  }
}