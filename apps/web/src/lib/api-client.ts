import { API_BASE, STORAGE_KEYS } from './config';
import { clearAuth } from './auth';

interface ApiOptions {
  apiKey?: string;
  body?: unknown;
  method?: string;
}

export interface UserSettings {
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  searxngUrl?: string;
  proxyUrls?: string[];
}

export interface UpdateUserSettingsDto {
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  searxngUrl?: string;
  proxyUrls?: string[];
}

export interface TestLlmDto {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface UpdateWebhookDto {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export interface UpdateScheduleDto {
  name?: string;
  cron?: string;
  config?: Record<string, unknown>;
  active?: boolean;
}

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const key = options.apiKey || readStoredToken();
  if (key) {
    // JWT tokens start with "eyJ"; everything else routes through X-API-Key.
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
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export const apiClient = {
  // Scrape
  scrape: (body: unknown, apiKey: string) =>
    api('/scrape', { body, apiKey }),

  // Crawl
  startCrawl: (body: unknown, apiKey: string) =>
    api('/crawl', { body, apiKey }),
  getCrawlStatus: (id: string, apiKey: string) =>
    api(`/crawl/${id}`, { apiKey }),
  getCrawlResults: (id: string, query: { page?: number; limit?: number } = {}, apiKey?: string) => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return api(`/crawl/${id}/results${qs ? `?${qs}` : ''}`, { apiKey });
  },
  cancelCrawl: (id: string, apiKey: string) =>
    api(`/crawl/${id}`, { method: 'DELETE', apiKey }),

  // Batch
  startBatch: (body: unknown, apiKey: string) =>
    api('/batch/scrape', { body, apiKey }),
  getBatchStatus: (id: string, apiKey: string) =>
    api(`/batch/scrape/${id}`, { apiKey }),

  // Map
  map: (body: unknown, apiKey: string) =>
    api('/map', { body, apiKey }),

  // Extract
  startExtract: (body: unknown, apiKey: string) =>
    api('/extract', { body, apiKey }),
  getExtractStatus: (id: string, apiKey: string) =>
    api(`/extract/${id}`, { apiKey }),
  cancelExtract: (id: string, apiKey: string) =>
    api(`/extract/${id}`, { method: 'DELETE', apiKey }),

  // Jobs
  listJobs: (params: string, apiKey: string) =>
    api(`/jobs?${params}`, { apiKey }),
  getJob: (id: string, apiKey: string) =>
    api(`/jobs/${id}`, { apiKey }),
  getJobStats: (apiKey: string) =>
    api('/jobs/stats', { apiKey }),
  cancelAllJobs: (apiKey: string) =>
    api('/jobs/cancel-all', { method: 'POST', apiKey }),

  // Auth
  createApiKey: (name: string) =>
    api('/auth/keys', { body: { name } }),
  listApiKeys: () =>
    api('/auth/keys'),
  revokeApiKey: (id: string) =>
    api(`/auth/keys/${id}`, { method: 'DELETE' }),

  // Webhooks
  createWebhook: (body: unknown, apiKey: string) =>
    api('/webhooks', { body, apiKey }),
  listWebhooks: (apiKey: string) =>
    api('/webhooks', { apiKey }),
  updateWebhook: (id: string, dto: UpdateWebhookDto, apiKey: string) =>
    api(`/webhooks/${id}`, { method: 'PATCH', body: dto, apiKey }),
  deleteWebhook: (id: string, apiKey: string) =>
    api(`/webhooks/${id}`, { method: 'DELETE', apiKey }),

  // Proxies
  addProxy: (body: unknown, apiKey: string) =>
    api('/proxies', { body, apiKey }),
  listProxies: (apiKey: string) =>
    api('/proxies', { apiKey }),
  removeProxy: (id: string, apiKey: string) =>
    api(`/proxies/${id}`, { method: 'DELETE', apiKey }),
  testProxy: (url: string, apiKey: string) =>
    api('/proxies/test', { body: { url }, apiKey }),

  // Search
  search: (body: unknown, apiKey: string) =>
    api('/search', { body, apiKey }),

  // Schedules
  createSchedule: (body: unknown, apiKey: string) =>
    api('/schedules', { body, apiKey }),
  listSchedules: (apiKey: string) =>
    api('/schedules', { apiKey }),
  getSchedule: (id: string, apiKey: string) =>
    api(`/schedules/${id}`, { apiKey }),
  updateSchedule: (id: string, dto: UpdateScheduleDto, apiKey: string) =>
    api(`/schedules/${id}`, { method: 'PATCH', body: dto, apiKey }),
  toggleSchedule: (id: string, apiKey: string) =>
    api(`/schedules/${id}/toggle`, { method: 'PATCH', apiKey }),
  deleteSchedule: (id: string, apiKey: string) =>
    api(`/schedules/${id}`, { method: 'DELETE', apiKey }),

  // Job results (paginated)
  getJobResults: (id: string, page: number, limit: number, apiKey: string) =>
    api(`/jobs/${id}/results?page=${page}&limit=${limit}`, { apiKey }),

  // User profile/settings
  getUserProfile: (): Promise<{ id: string; email: string; name?: string }> =>
    api('/user/profile'),
  getUserSettings: (): Promise<UserSettings> =>
    api('/user/settings'),
  updateUserSettings: (dto: UpdateUserSettingsDto): Promise<UserSettings> =>
    api('/user/settings', { method: 'PATCH', body: dto }),
  testLLM: (dto: TestLlmDto): Promise<{ success: boolean; error?: string }> =>
    api('/user/test-llm', { method: 'POST', body: dto }),

  // Storage
  getScreenshotUrl: (jobId: string): string =>
    `${API_BASE}/api/v1/storage/screenshots/${jobId}`,

  // Health
  health: () => api('/health'),
};
