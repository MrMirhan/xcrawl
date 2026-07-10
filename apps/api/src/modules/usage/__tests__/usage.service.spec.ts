import { ForbiddenException } from '@nestjs/common';
import { UsagePool } from '@xcrawl/shared';
import { UsageService } from '../usage.service';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
  },
  usageEvent: {
    aggregate: jest.fn(),
  },
};

describe('UsageService', () => {
  let service: UsageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsageService(mockPrismaService as any);
  });

  const setupUser = (user: any) => {
    mockPrismaService.user.findUnique.mockResolvedValue(user);
  };

  const setupAggregates = (daily: number | null, weekly: number | null) => {
    mockPrismaService.usageEvent.aggregate
      .mockResolvedValueOnce({ _sum: { amount: daily } })
      .mockResolvedValueOnce({ _sum: { amount: weekly } });
  };

  const unlimitedPlan = {
    id: 'plan-1',
    name: 'Unlimited',
    description: null,
    isDefault: true,
    dailyPageLimit: null,
    weeklyPageLimit: null,
    dailySearchLimit: null,
    weeklySearchLimit: null,
    dailyExtractLimit: null,
    weeklyExtractLimit: null,
    canUseOwnLlm: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const limitedPlan = {
    ...unlimitedPlan,
    id: 'plan-2',
    name: 'Limited',
    dailyPageLimit: 100,
    weeklyPageLimit: 500,
    dailySearchLimit: 50,
    weeklySearchLimit: 200,
    dailyExtractLimit: 30,
    weeklyExtractLimit: 100,
    canUseOwnLlm: false,
  };

  describe('assertWithinQuota', () => {
    it('passes when plan has unlimited limits (all null)', async () => {
      setupUser({ plan: unlimitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).resolves.toBeUndefined();
      expect(mockPrismaService.usageEvent.aggregate).not.toHaveBeenCalled();
    });

    it('passes when usage is under limit', async () => {
      setupUser({ plan: limitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });
      setupAggregates(10, 50);
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).resolves.toBeUndefined();
    });

    it('rejects when daily usage is at limit', async () => {
      setupUser({ plan: limitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });
      setupAggregates(100, 50);
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when daily usage exceeds limit', async () => {
      setupUser({ plan: limitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });
      setupAggregates(101, 50);
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when weekly usage is at limit (but daily is under)', async () => {
      setupUser({ plan: limitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });
      setupAggregates(10, 500);
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('passes when userId is undefined (no attributable user)', async () => {
      await expect(service.assertWithinQuota(undefined, UsagePool.PAGES)).resolves.toBeUndefined();
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('passes when no plan and no overrides (fail-open)', async () => {
      setupUser({ plan: null, limitOverrides: null, canUseOwnLlmOverride: null });
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).resolves.toBeUndefined();
    });

    it('override present replaces plan value (override lower than plan)', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: { dailyPageLimit: 10 },
        canUseOwnLlmOverride: null,
      });
      setupAggregates(10, 50);
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('override to null (unlimited) replaces plan limited value', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: { dailyPageLimit: null, weeklyPageLimit: null },
        canUseOwnLlmOverride: null,
      });
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).resolves.toBeUndefined();
    });

    it('override absent for a field falls through to plan value', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: { dailySearchLimit: 999 },
        canUseOwnLlmOverride: null,
      });
      setupAggregates(100, 50);
      await expect(service.assertWithinQuota('user-1', UsagePool.PAGES)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getEffectiveLimits', () => {
    it('returns plan limits when no overrides', async () => {
      setupUser({ plan: limitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });
      const limits = await service.getEffectiveLimits('user-1');
      expect(limits.dailyPageLimit).toBe(100);
      expect(limits.weeklyPageLimit).toBe(500);
      expect(limits.canUseOwnLlm).toBe(false);
    });

    it('override present wins over plan value', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: { dailyPageLimit: 200 },
        canUseOwnLlmOverride: null,
      });
      const limits = await service.getEffectiveLimits('user-1');
      expect(limits.dailyPageLimit).toBe(200);
      expect(limits.weeklyPageLimit).toBe(500);
    });

    it('override to null makes field unlimited even when plan has a limit', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: { dailyPageLimit: null },
        canUseOwnLlmOverride: null,
      });
      const limits = await service.getEffectiveLimits('user-1');
      expect(limits.dailyPageLimit).toBeNull();
      expect(limits.weeklyPageLimit).toBe(500);
    });

    it('no plan and no overrides returns all null and canUseOwnLlm false', async () => {
      setupUser({ plan: null, limitOverrides: null, canUseOwnLlmOverride: null });
      const limits = await service.getEffectiveLimits('user-1');
      expect(limits.dailyPageLimit).toBeNull();
      expect(limits.weeklyPageLimit).toBeNull();
      expect(limits.canUseOwnLlm).toBe(false);
    });

    it('canUseOwnLlmOverride true overrides plan false', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: null,
        canUseOwnLlmOverride: true,
      });
      const limits = await service.getEffectiveLimits('user-1');
      expect(limits.canUseOwnLlm).toBe(true);
    });

    it('canUseOwnLlmOverride null falls through to plan value', async () => {
      setupUser({
        plan: limitedPlan,
        limitOverrides: null,
        canUseOwnLlmOverride: null,
      });
      const limits = await service.getEffectiveLimits('user-1');
      expect(limits.canUseOwnLlm).toBe(false);
    });
  });

  describe('getUsage', () => {
    it('returns summary with plan info and pool data', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ plan: { name: 'Limited', description: 'A plan' } })
        .mockResolvedValueOnce({ plan: limitedPlan, limitOverrides: null, canUseOwnLlmOverride: null });

      mockPrismaService.usageEvent.aggregate
        .mockResolvedValue({ _sum: { amount: 5 } });

      const summary = await service.getUsage('user-1');
      expect(summary.plan).toEqual({ name: 'Limited', description: 'A plan' });
      expect(summary.pools[UsagePool.PAGES].dailyUsed).toBe(5);
      expect(summary.pools[UsagePool.PAGES].dailyLimit).toBe(100);
      expect(summary.pools[UsagePool.SEARCH].dailyUsed).toBe(5);
      expect(summary.pools[UsagePool.SEARCH].dailyLimit).toBe(50);
      expect(summary.pools[UsagePool.EXTRACT].dailyUsed).toBe(5);
      expect(summary.pools[UsagePool.EXTRACT].dailyLimit).toBe(30);
    });

    it('defaults used to 0 when aggregate returns null (no events)', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ plan: null })
        .mockResolvedValueOnce({ plan: null, limitOverrides: null, canUseOwnLlmOverride: null });

      mockPrismaService.usageEvent.aggregate
        .mockResolvedValue({ _sum: { amount: null } });

      const summary = await service.getUsage('user-1');
      expect(summary.plan).toBeNull();
      expect(summary.pools[UsagePool.PAGES].dailyUsed).toBe(0);
      expect(summary.pools[UsagePool.SEARCH].dailyUsed).toBe(0);
      expect(summary.pools[UsagePool.EXTRACT].dailyUsed).toBe(0);
    });
  });
});