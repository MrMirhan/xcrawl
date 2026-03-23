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
