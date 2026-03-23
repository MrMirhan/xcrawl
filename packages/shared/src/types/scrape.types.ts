export type OutputFormat =
  | 'markdown'
  | 'html'
  | 'rawHtml'
  | 'text'
  | 'links'
  | 'images'
  | 'screenshot'
  | 'json';

export type ActionType =
  | 'click'
  | 'type'
  | 'scroll'
  | 'wait'
  | 'waitForSelector'
  | 'screenshot'
  | 'executeJavascript';

export type CrawlerEngine = 'auto' | 'cheerio' | 'playwright';

export interface BrowserAction {
  type: ActionType;
  selector?: string;
  text?: string;
  milliseconds?: number;
  direction?: 'up' | 'down';
  code?: string;
}

export interface ScrapeRequest {
  url: string;
  formats?: OutputFormat[];
  onlyMainContent?: boolean;
  waitFor?: number;
  timeout?: number;
  actions?: BrowserAction[];
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
  mobile?: boolean;
  engine?: CrawlerEngine;
}

export interface ScrapeResult {
  url: string;
  statusCode?: number;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  text?: string;
  links?: string[];
  images?: string[];
  screenshot?: string;
  json?: unknown;
  metadata: {
    title?: string;
    description?: string;
    language?: string;
    statusCode?: number;
    duration: number;
  };
}
