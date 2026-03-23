import type { OutputFormat, CrawlerEngine } from './scrape.types.js';

export interface CrawlRequest {
  url: string;
  maxPages?: number;
  maxDepth?: number;
  formats?: OutputFormat[];
  onlyMainContent?: boolean;
  includePaths?: string[];
  excludePaths?: string[];
  regexOnFullUrl?: boolean;
  allowExternalLinks?: boolean;
  allowSubdomains?: boolean;
  sitemap?: 'include' | 'skip' | 'only';
  ignoreQueryParameters?: boolean;
  delay?: number;
  maxConcurrency?: number;
  timeout?: number;
  engine?: CrawlerEngine;
  dismissPopups?: boolean;
  skipPaywalls?: boolean;
  webhookUrl?: string;
  webhookEvents?: string[];
  webhook?: {
    url: string;
    events?: string[];
    metadata?: Record<string, unknown>;
  };
}

export interface CrawlStatusResponse {
  id: string;
  status: string;
  progress: {
    completed: number;
    total: number;
    currentUrl?: string;
  };
  data?: unknown[];
}

export interface BatchScrapeRequest {
  urls: string[];
  formats?: OutputFormat[];
  onlyMainContent?: boolean;
  timeout?: number;
  engine?: CrawlerEngine;
  webhookUrl?: string;
}

export interface MapRequest {
  url: string;
  search?: string;
  includeSitemap?: boolean;
  limit?: number;
}

export interface MapResponse {
  success: boolean;
  links: string[];
  count: number;
}
