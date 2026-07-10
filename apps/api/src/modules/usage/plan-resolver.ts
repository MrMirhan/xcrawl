import type { Plan } from '@xcrawl/db';
import type { EffectiveLimits } from '@xcrawl/shared';

export type { EffectiveLimits };

export function resolvePlanLimits(input: {
  plan: Plan | null;
  limitOverrides: Record<string, number | null> | null;
  canUseOwnLlmOverride: boolean | null;
}): EffectiveLimits {
  const key = (field: keyof EffectiveLimits): number | null => {
    if (input.limitOverrides && field in input.limitOverrides) {
      return input.limitOverrides[field] as number | null;
    }
    if (input.plan) {
      return ((input.plan as Record<string, unknown>)[field as string] as number | null) ?? null;
    }
    return null;
  };

  return {
    dailyPageLimit: key('dailyPageLimit'),
    weeklyPageLimit: key('weeklyPageLimit'),
    dailySearchLimit: key('dailySearchLimit'),
    weeklySearchLimit: key('weeklySearchLimit'),
    dailyExtractLimit: key('dailyExtractLimit'),
    weeklyExtractLimit: key('weeklyExtractLimit'),
    canUseOwnLlm: input.canUseOwnLlmOverride ?? input.plan?.canUseOwnLlm ?? false,
  };
}