import { ProxyConfiguration } from 'crawlee';

export interface ProxyTier {
  tier: number;
  urls: string[];
  label: string;
}

/**
 * Creates a tiered proxy configuration.
 * Tier 0: No proxy (direct connection)
 * Tier 1: Budget proxies
 * Tier 2: Premium proxies
 *
 * Crawlee escalates to higher tiers when lower tiers get blocked.
 */
export function createTieredProxyConfig(proxyUrls: string[]): ProxyConfiguration | undefined {
  if (proxyUrls.length === 0) return undefined;

  // If we have proxies, create tiered config:
  // Tier 0: no proxy (direct)
  // Tier 1: all provided proxies
  return new ProxyConfiguration({
    tieredProxyUrls: [
      [undefined as unknown as string], // Tier 0: direct connection (no proxy)
      proxyUrls,                         // Tier 1: all proxies
    ],
  });
}

/**
 * Creates a simple round-robin proxy configuration.
 */
export function createRoundRobinProxyConfig(proxyUrls: string[]): ProxyConfiguration | undefined {
  if (proxyUrls.length === 0) return undefined;
  return new ProxyConfiguration({ proxyUrls });
}

/**
 * Creates a session-aware proxy configuration.
 * Each session gets a consistent proxy for the lifetime of that session.
 */
export function createSessionProxyConfig(proxyUrls: string[]): ProxyConfiguration | undefined {
  if (proxyUrls.length === 0) return undefined;

  return new ProxyConfiguration({
    newUrlFunction: async (sessionId: string | number) => {
      // Hash session ID to consistently map to a proxy
      const id = String(sessionId);
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = Math.trunc((hash << 5) - hash + id.codePointAt(i)!);
      }
      const index = Math.abs(hash) % proxyUrls.length;
      return proxyUrls[index];
    },
  });
}
