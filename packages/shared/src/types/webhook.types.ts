export type WebhookEvent =
  | 'job.completed'
  | 'job.failed'
  | 'crawl.page'
  | 'crawl.started'
  | 'crawl.completed';

export interface WebhookPayload {
  event: WebhookEvent;
  jobId: string;
  timestamp: string;
  data?: unknown;
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  headers: Record<string, string> | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
}

export interface WebhookMutationResponse {
  success: boolean;
}
