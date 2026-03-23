export interface EngineOptions {
  maxConcurrency?: number;
  defaultTimeout?: number;
  headless?: boolean;
  proxyUrls?: string[];
  useSessionPool?: boolean;
}

export type OutputFormat =
  | 'markdown'
  | 'html'
  | 'rawHtml'
  | 'text'
  | 'links'
  | 'images'
  | 'screenshot'
  | 'json';

export interface ScrapeOptions {
  url: string;
  formats?: OutputFormat[];
  onlyMainContent?: boolean;
  waitFor?: number;
  timeout?: number;
  actions?: BrowserActionInput[];
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
  mobile?: boolean;
  engine?: 'auto' | 'cheerio' | 'playwright';
  dismissPopups?: boolean;
}

export interface BrowserActionInput {
  type: 'click' | 'type' | 'scroll' | 'wait' | 'waitForSelector' | 'screenshot' | 'executeJavascript';
  selector?: string;
  text?: string;
  milliseconds?: number;
  direction?: 'up' | 'down';
  code?: string;
}

export interface ScrapeOutput {
  url: string;
  statusCode?: number;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  text?: string;
  links?: string[];
  images?: string[];
  screenshot?: string; // base64
  metadata: {
    title?: string;
    description?: string;
    language?: string;
    statusCode?: number;
    duration: number;
    ogImage?: string;
    favicon?: string;
    author?: string;
    keywords?: string[];
    canonical?: string;
    jsonLd?: unknown[];
  };
}

export interface CrawlOptions {
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
  engine?: 'auto' | 'cheerio' | 'playwright';
  dismissPopups?: boolean;
  skipPaywalls?: boolean;
}

export interface CrawlCallbacks {
  onPageComplete: (result: ScrapeOutput) => void | Promise<void>;
  onProgress: (completed: number, total: number, currentUrl: string) => void;
  onError: (url: string, error: Error) => void;
  isCancelled: () => boolean;
}

export interface MapOptions {
  url: string;
  search?: string;
  includeSitemap?: boolean;
  limit?: number;
}
