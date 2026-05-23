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

export interface JobListItem {
  id: string;
  type: string;
  status: string;
  url: string | null;
  resultCount: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface JobResultRecord {
  id: string;
  jobId: string;
  url: string;
  statusCode: number | null;
  markdown: string | null;
  html: string | null;
  rawHtml: string | null;
  text: string | null;
  json: unknown;
  links: string[];
  images: string[];
  screenshotPath: string | null;
  storagePaths: unknown;
  extractedData: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface JobDetails {
  id: string;
  type: string;
  status: string;
  priority: number;
  url: string | null;
  urls: string[];
  config: unknown;
  resultCount: number;
  error: string | null;
  metadata: unknown;
  apiKeyId: string | null;
  userId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  results: JobResultRecord[];
  _count: { results: number };
}

export interface JobStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
}

export interface CancelAllJobsResponse {
  success: boolean;
  cancelled: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
