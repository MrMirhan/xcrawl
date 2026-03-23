import { SessionPoolOptions } from 'crawlee';

/**
 * Session pool configuration for anti-blocking.
 * Sessions track cookies, IPs, and error rates.
 * Bad sessions get retired automatically.
 */
export function getSessionPoolOptions(options?: {
  maxPoolSize?: number;
  maxSessionAge?: number;
  maxErrorScore?: number;
}): SessionPoolOptions {
  return {
    maxPoolSize: options?.maxPoolSize ?? 100,
    sessionOptions: {
      maxAgeSecs: options?.maxSessionAge ?? 3600,     // 1 hour
      maxErrorScore: options?.maxErrorScore ?? 3,       // retire after 3 errors
      maxUsageCount: 50,                                // retire after 50 uses
    },
    persistStateKeyValueStoreId: undefined,             // in-memory only
  };
}

/**
 * Determines if a response indicates the request was blocked.
 */
export function isBlocked(statusCode: number, body?: string): boolean {
  // Definite blocking status codes
  if ([403, 429, 503, 520, 521, 522, 523, 524].includes(statusCode)) {
    return true;
  }

  // Only check body patterns on suspicious status codes or very short responses
  // (normal 200 pages often contain words like "challenge" or "cloudflare" in regular content)
  if (body && (statusCode >= 400 || body.length < 5000)) {
    const lowerBody = body.toLowerCase();
    const blockPatterns = [
      'access denied',
      'captcha',
      'rate limit exceeded',
      'too many requests',
      'bot detection',
      'please verify you are a human',
      'human verification required',
      'enable javascript and cookies to continue',
      'checking your browser',
      'just a moment...',
    ];
    return blockPatterns.some((p) => lowerBody.includes(p));
  }

  return false;
}

/**
 * Determines the appropriate delay between requests based on blocking signals.
 */
export function calculateDelay(options: {
  baseDelay?: number;
  wasBlocked?: boolean;
  errorCount?: number;
}): number {
  const base = options.baseDelay ?? 0;
  const blockMultiplier = options.wasBlocked ? 5 : 1;
  const errorMultiplier = Math.min(1 + (options.errorCount ?? 0) * 0.5, 5);

  // Add jitter (10-30% random variation)
  const jitter = 1 + (Math.random() * 0.2 + 0.1);

  return Math.round(base * blockMultiplier * errorMultiplier * jitter);
}
