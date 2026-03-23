export enum JobType {
  SCRAPE = 'SCRAPE',
  CRAWL = 'CRAWL',
  BATCH_SCRAPE = 'BATCH_SCRAPE',
  MAP = 'MAP',
  EXTRACT = 'EXTRACT',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PARTIAL = 'PARTIAL',
}

export interface JobProgress {
  completed: number;
  total: number;
  currentUrl?: string;
}

export interface JobMetadata {
  duration?: number;
  pagesProcessed?: number;
  bytesDownloaded?: number;
}
