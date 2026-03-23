import { IsString, IsUrl, IsOptional, IsArray, IsBoolean, IsNumber, IsIn, IsObject } from 'class-validator';

export class CrawlRequestDto {
  @IsUrl()
  url: string;

  /** Maximum number of pages to crawl. No hard cap — set as high as needed. Default: 10 */
  @IsOptional()
  @IsNumber()
  maxPages?: number;

  /** Maximum discovery depth from root URL. Each link hop increments depth by 1. */
  @IsOptional()
  @IsNumber()
  maxDepth?: number;

  /** Output formats for each scraped page */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: string[];

  /** Extract only main content (strips nav, footer, sidebars). Default: true */
  @IsOptional()
  @IsBoolean()
  onlyMainContent?: boolean;

  /** URL pathname regex patterns to include. Only matching paths are crawled. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePaths?: string[];

  /** URL pathname regex patterns to exclude from the crawl. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePaths?: string[];

  /** Match includePaths/excludePaths against the full URL instead of just pathname */
  @IsOptional()
  @IsBoolean()
  regexOnFullUrl?: boolean;

  /** Follow links to external websites */
  @IsOptional()
  @IsBoolean()
  allowExternalLinks?: boolean;

  /** Follow links to subdomains of the main domain */
  @IsOptional()
  @IsBoolean()
  allowSubdomains?: boolean;

  /** Sitemap handling: "include" (default), "skip", or "only" */
  @IsOptional()
  @IsIn(['include', 'skip', 'only'])
  sitemap?: string;

  /** Avoid re-scraping the same path with different query parameters */
  @IsOptional()
  @IsBoolean()
  ignoreQueryParameters?: boolean;

  /** Delay in milliseconds between scrapes to respect rate limits */
  @IsOptional()
  @IsNumber()
  delay?: number;

  /** Maximum concurrent scrapes */
  @IsOptional()
  @IsNumber()
  maxConcurrency?: number;

  /** Timeout per page in milliseconds */
  @IsOptional()
  @IsNumber()
  timeout?: number;

  /** Crawler engine: auto (default), cheerio (fast/no JS), playwright (full browser) */
  @IsOptional()
  @IsIn(['auto', 'cheerio', 'playwright'])
  engine?: string;

  /** Webhook URL for real-time notifications */
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  /** Webhook events to subscribe to */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  webhookEvents?: string[];

  /** Webhook configuration object */
  @IsOptional()
  @IsObject()
  webhook?: {
    url: string;
    events?: string[];
    metadata?: Record<string, unknown>;
  };

  /** Auto-dismiss popups and cookie banners (Playwright only, default: true) */
  @IsOptional()
  @IsBoolean()
  dismissPopups?: boolean;

  /** Skip pages detected as paywalled */
  @IsOptional()
  @IsBoolean()
  skipPaywalls?: boolean;

  /** JSON schema for per-page structured extraction */
  @IsOptional()
  @IsObject()
  extractSchema?: Record<string, unknown>;

  /** Natural language prompt for per-page extraction */
  @IsOptional()
  @IsString()
  extractPrompt?: string;
}
