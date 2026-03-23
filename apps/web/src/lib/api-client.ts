const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions {
  apiKey?: string;
  body?: unknown;
  method?: string;
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Use provided apiKey, or fall back to stored JWT token
  const key = options.apiKey || (typeof window !== 'undefined' ? localStorage.getItem('xcrawl-token') : null);
  if (key) {
    // JWT tokens start with "eyJ" — send as Bearer, otherwise as X-API-Key
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
  toggleSchedule: (id: string, apiKey: string) =>
    api(`/schedules/${id}/toggle`, { method: 'PATCH', apiKey }),
  deleteSchedule: (id: string, apiKey: string) =>
    api(`/schedules/${id}`, { method: 'DELETE', apiKey }),

  // Job results (paginated)
  getJobResults: (id: string, page: number, limit: number, apiKey: string) =>
    api(`/jobs/${id}/results?page=${page}&limit=${limit}`, { apiKey }),

  // Health
  health: () => api('/health'),
};
