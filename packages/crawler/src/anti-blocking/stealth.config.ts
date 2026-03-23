import type { PlaywrightCrawlerOptions } from 'crawlee';

/**
 * Browser fingerprinting and stealth configuration for PlaywrightCrawler.
 * Uses Crawlee's built-in fingerprinting + additional stealth measures.
 */
export function getStealthOptions(): Partial<PlaywrightCrawlerOptions> {
  return {
    useSessionPool: true,
    persistCookiesPerSession: true,
    browserPoolOptions: {
      useFingerprints: true,
      fingerprintOptions: {
        fingerprintGeneratorOptions: {
          browsers: ['chrome', 'firefox'],
          devices: ['desktop'],
          operatingSystems: ['windows', 'macos', 'linux'],
          locales: ['en-US', 'en-GB'],
        },
      },
    },
    launchContext: {
      launchOptions: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
      },
    },
  };
}

/**
 * User-Agent strings for HTTP crawlers (CheerioCrawler).
 * Rotated per-session by SessionPool.
 */
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
