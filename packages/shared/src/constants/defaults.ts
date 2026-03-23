export const DEFAULTS = {
  SCRAPE_TIMEOUT: 30_000,
  CRAWL_MAX_DEPTH: 3,
  CRAWL_MAX_PAGES: 100,
  CRAWL_DELAY: 0,
  MAX_CONCURRENCY: 10,
  OUTPUT_FORMATS: ['markdown'] as const,
  MAP_LIMIT: 5000,
} as const;

export const QUEUES = {
  SCRAPE: 'scrape',
  CRAWL: 'crawl',
  BATCH_SCRAPE: 'batch-scrape',
  EXTRACT: 'extract',
  WEBHOOK: 'webhook-delivery',
} as const;
