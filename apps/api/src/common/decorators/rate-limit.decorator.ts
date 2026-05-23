import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RATE_LIMIT_SKIP_KEY = 'rateLimitSkip';

export interface RateLimitOptions {
  limit: number;
  window: number;
}

/**
 * Per-route override for ApiKeyRateLimitGuard.
 * @param limit  Max requests in the window.
 * @param window Window length in seconds.
 */
export const RateLimit = (limit: number, window: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, window } satisfies RateLimitOptions);

/** Marks a handler/controller as exempt from rate limiting. */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);
