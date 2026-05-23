import type {
  ScrapeRequest,
  ScrapeResult,
  CrawlRequest,
  BatchScrapeRequest,
  MapRequest,
  MapResponse,
  ExtractRequest,
  SearchRequest,
  SearchResponse,
  ApiKeySummary,
  CreatedApiKey,
  RevokeApiKeyResponse,
  CreateApiKeyRequest,
  WebhookConfig,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookMutationResponse,
  Schedule,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  ScheduleMutationResponse,
  ProxyConfig,
  AddProxyRequest,
  ProxyTestResult,
  ProxyMutationResponse,
  UserProfile,
  UserSettings,
  UpdateUserSettingsRequest,
  TestLlmRequest,
  TestLlmResponse,
  JobListItem,
  JobDetails,
  JobResultRecord,
  JobStats,
  CancelAllJobsResponse,
  Pagination,
} from '@xcrawl/shared';
import { API_BASE, STORAGE_KEYS } from './config';
import { clearAuth } from './auth';

export type {
  UserSettings,
  UpdateUserSettingsRequest as UpdateUserSettingsDto,
  TestLlmRequest as TestLlmDto,
  UpdateWebhookRequest as UpdateWebhookDto,
  UpdateScheduleRequest as UpdateScheduleDto,
};

interface ApiOptions {
  apiKey?: string;
  body?: unknown;
  method?: string;
}

export interface ScrapeListResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface ScrapeApiResponse {
  success: boolean;
  data?: ScrapeResult;
  cached?: boolean;
  error?: string;
}

export interface JobCreatedResponse {
  success: boolean;
  id: string;
}

export interface CrawlStatusResponse {
  id: string;
  status: string;
  progress: {
    completed: number;
    total: number;
    currentUrl?: string;
  };
  data: Array<{
    url: string;
    markdown: string | null;
    html: string | null;
    links: string[];
    images: string[];
    statusCode: number | null;
    metadata: unknown;
    extractedData: unknown;
    screenshotPath: string | null;
  }>;
}

export interface CrawlCancelResponse {
  success: boolean;
}

export interface BatchStatusResponse {
  id: string;
  status: string;
  completed: number;
  total: number;
  data: Array<{
    url: string;
    markdown: string | null;
    statusCode: number | null;
    metadata: unknown;
  }>;
}

export interface ExtractStatusResponse {
  id: string;
  status: string;
  completed: number;
  total: number;
  data: Array<{
    url: string;
    markdown: string | null;
    extractedData: unknown;
  }>;
}

export interface ExtractCancelResponse {
  success: boolean;
}

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const key = options.apiKey || readStoredToken();
  if (key) {
    if (key.startsWith('eyJ')) {
      headers['Authorization'] = `Bearer ${key}`;
    } else {
      headers['X-API-Key'] = key;
    }
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  // Scrape
  scrape: (body: ScrapeRequest | Record<string, unknown>, apiKey: string): Promise<ScrapeApiResponse> =>
    request<ScrapeApiResponse>('/scrape', { body, apiKey }),

  // Crawl
  startCrawl: (body: CrawlRequest | Record<string, unknown>, apiKey: string): Promise<JobCreatedResponse> =>
    request<JobCreatedResponse>('/crawl', { body, apiKey }),
  getCrawlStatus: (id: string, apiKey: string): Promise<CrawlStatusResponse> =>
    request<CrawlStatusResponse>(`/crawl/${id}`, { apiKey }),
  getCrawlResults: (
    id: string,
    query: { page?: number; limit?: number } = {},
    apiKey?: string,
  ): Promise<ScrapeListResponse<JobResultRecord>> => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return request<ScrapeListResponse<JobResultRecord>>(
      `/crawl/${id}/results${qs ? `?${qs}` : ''}`,
      { apiKey },
    );
  },
  cancelCrawl: (id: string, apiKey: string): Promise<CrawlCancelResponse> =>
    request<CrawlCancelResponse>(`/crawl/${id}`, { method: 'DELETE', apiKey }),

  // Batch
  startBatch: (body: BatchScrapeRequest | Record<string, unknown>, apiKey: string): Promise<JobCreatedResponse> =>
    request<JobCreatedResponse>('/batch/scrape', { body, apiKey }),
  getBatchStatus: (id: string, apiKey: string): Promise<BatchStatusResponse> =>
    request<BatchStatusResponse>(`/batch/scrape/${id}`, { apiKey }),

  // Map
  map: (body: MapRequest, apiKey: string): Promise<MapResponse> =>
    request<MapResponse>('/map', { body, apiKey }),

  // Extract
  startExtract: (body: ExtractRequest | Record<string, unknown>, apiKey: string): Promise<JobCreatedResponse> =>
    request<JobCreatedResponse>('/extract', { body, apiKey }),
  getExtractStatus: (id: string, apiKey: string): Promise<ExtractStatusResponse> =>
    request<ExtractStatusResponse>(`/extract/${id}`, { apiKey }),
  cancelExtract: (id: string, apiKey: string): Promise<ExtractCancelResponse> =>
    request<ExtractCancelResponse>(`/extract/${id}`, { method: 'DELETE', apiKey }),

  // Jobs
  listJobs: (params: string, apiKey: string): Promise<ScrapeListResponse<JobListItem>> =>
    request<ScrapeListResponse<JobListItem>>(`/jobs?${params}`, { apiKey }),
  getJob: (id: string, apiKey: string): Promise<JobDetails> =>
    request<JobDetails>(`/jobs/${id}`, { apiKey }),
  getJobStats: (apiKey: string): Promise<JobStats> =>
    request<JobStats>('/jobs/stats', { apiKey }),
  cancelAllJobs: (apiKey: string): Promise<CancelAllJobsResponse> =>
    request<CancelAllJobsResponse>('/jobs/cancel-all', { method: 'POST', apiKey }),
  getJobResults: (
    id: string,
    page: number,
    limit: number,
    apiKey: string,
  ): Promise<ScrapeListResponse<JobResultRecord>> =>
    request<ScrapeListResponse<JobResultRecord>>(
      `/jobs/${id}/results?page=${page}&limit=${limit}`,
      { apiKey },
    ),

  // Auth
  createApiKey: (name: string): Promise<CreatedApiKey> => {
    const body: CreateApiKeyRequest = { name };
    return request<CreatedApiKey>('/auth/keys', { body });
  },
  listApiKeys: (): Promise<ApiKeySummary[]> =>
    request<ApiKeySummary[]>('/auth/keys'),
  revokeApiKey: (id: string): Promise<RevokeApiKeyResponse> =>
    request<RevokeApiKeyResponse>(`/auth/keys/${id}`, { method: 'DELETE' }),

  // Webhooks
  createWebhook: (body: CreateWebhookRequest, apiKey: string): Promise<WebhookConfig> =>
    request<WebhookConfig>('/webhooks', { body, apiKey }),
  listWebhooks: (apiKey: string): Promise<WebhookConfig[]> =>
    request<WebhookConfig[]>('/webhooks', { apiKey }),
  updateWebhook: (id: string, dto: UpdateWebhookRequest, apiKey: string): Promise<WebhookConfig> =>
    request<WebhookConfig>(`/webhooks/${id}`, { method: 'PATCH', body: dto, apiKey }),
  deleteWebhook: (id: string, apiKey: string): Promise<WebhookMutationResponse> =>
    request<WebhookMutationResponse>(`/webhooks/${id}`, { method: 'DELETE', apiKey }),

  // Proxies
  addProxy: (body: AddProxyRequest, apiKey: string): Promise<ProxyConfig> =>
    request<ProxyConfig>('/proxies', { body, apiKey }),
  listProxies: (apiKey: string): Promise<ProxyConfig[]> =>
    request<ProxyConfig[]>('/proxies', { apiKey }),
  removeProxy: (id: string, apiKey: string): Promise<ProxyMutationResponse> =>
    request<ProxyMutationResponse>(`/proxies/${id}`, { method: 'DELETE', apiKey }),
  testProxy: (url: string, apiKey: string): Promise<ProxyTestResult> =>
    request<ProxyTestResult>('/proxies/test', { body: { url }, apiKey }),

  // Search
  search: (body: SearchRequest, apiKey: string): Promise<SearchResponse> =>
    request<SearchResponse>('/search', { body, apiKey }),

  // Schedules
  createSchedule: (body: CreateScheduleRequest, apiKey: string): Promise<Schedule> =>
    request<Schedule>('/schedules', { body, apiKey }),
  listSchedules: (apiKey: string): Promise<Schedule[]> =>
    request<Schedule[]>('/schedules', { apiKey }),
  getSchedule: (id: string, apiKey: string): Promise<Schedule> =>
    request<Schedule>(`/schedules/${id}`, { apiKey }),
  updateSchedule: (id: string, dto: UpdateScheduleRequest, apiKey: string): Promise<Schedule> =>
    request<Schedule>(`/schedules/${id}`, { method: 'PATCH', body: dto, apiKey }),
  toggleSchedule: (id: string, apiKey: string): Promise<Schedule> =>
    request<Schedule>(`/schedules/${id}/toggle`, { method: 'PATCH', apiKey }),
  deleteSchedule: (id: string, apiKey: string): Promise<ScheduleMutationResponse> =>
    request<ScheduleMutationResponse>(`/schedules/${id}`, { method: 'DELETE', apiKey }),

  // User profile/settings
  getUserProfile: (): Promise<UserProfile> =>
    request<UserProfile>('/user/profile'),
  getUserSettings: (): Promise<UserSettings> =>
    request<UserSettings>('/user/settings'),
  updateUserSettings: (dto: UpdateUserSettingsRequest): Promise<UserSettings> =>
    request<UserSettings>('/user/settings', { method: 'PATCH', body: dto }),
  testLLM: (dto: TestLlmRequest): Promise<TestLlmResponse> =>
    request<TestLlmResponse>('/user/test-llm', { method: 'POST', body: dto }),

  // Storage
  getScreenshotUrl: (jobId: string): string =>
    `${API_BASE}/api/v1/storage/screenshots/${jobId}`,

  // Health
  health: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),
};
