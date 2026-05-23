import type { MapResponse, SearchResponse } from '@xcrawl/shared';
import type {
  ScrapeApiResponse,
  CrawlStatusResponse,
  BatchStatusResponse,
  ExtractStatusResponse,
} from '@/lib/api-client';

export type PlaygroundMode = 'scrape' | 'crawl' | 'map' | 'extract' | 'search';

export type PlaygroundResult =
  | ScrapeApiResponse
  | MapResponse
  | SearchResponse
  | CrawlStatusResponse
  | BatchStatusResponse
  | ExtractStatusResponse;

export const formatOptions = ['markdown', 'html', 'links', 'images', 'screenshot', 'text', 'rawHtml'];

export interface ScrapeSettings {
  formats: string[];
  engine: 'auto' | 'cheerio' | 'playwright';
  onlyMainContent: boolean;
  timeout: number;
  waitFor: number;
  mobile: boolean;
  includeTags: string[];
  excludeTags: string[];
}

export const defaultScrapeSettings: ScrapeSettings = {
  formats: ['markdown'],
  engine: 'auto',
  onlyMainContent: true,
  timeout: 30000,
  waitFor: 0,
  mobile: false,
  includeTags: [],
  excludeTags: [],
};

export interface CrawlSettings {
  maxPages: number;
  maxDepth: number | null;
  formats: string[];
  onlyMainContent: boolean;
  includePaths: string[];
  excludePaths: string[];
  regexOnFullUrl: boolean;
  allowExternalLinks: boolean;
  allowSubdomains: boolean;
  sitemap: 'include' | 'skip' | 'only';
  ignoreQueryParameters: boolean;
  delay: number;
  maxConcurrency: number;
  engine: 'auto' | 'cheerio' | 'playwright';
  dismissPopups: boolean;
  skipPaywalls: boolean;
}

export const defaultCrawlSettings: CrawlSettings = {
  maxPages: 10,
  maxDepth: null,
  formats: ['markdown'],
  onlyMainContent: true,
  includePaths: [],
  excludePaths: [],
  regexOnFullUrl: false,
  allowExternalLinks: false,
  allowSubdomains: false,
  sitemap: 'include',
  ignoreQueryParameters: false,
  delay: 0,
  maxConcurrency: 5,
  engine: 'auto',
  dismissPopups: true,
  skipPaywalls: false,
};
