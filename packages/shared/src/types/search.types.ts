import type { OutputFormat, CrawlerEngine } from './scrape.types.js';

export interface SearchRequest {
  query: string;
  limit?: number;
  formats?: OutputFormat[] | string[];
  searxngUrl?: string;
  engine?: CrawlerEngine | string;
}

export interface SearchResultItem {
  url: string;
  title?: string;
  snippet: string;
  markdown?: string;
  html?: string;
  links?: string[];
  statusCode?: number;
}

export interface SearchResponse {
  success: boolean;
  data: SearchResultItem[];
  count: number;
  query?: string;
}
