export interface Schedule {
  id: string;
  name: string;
  type: 'SCRAPE' | 'CRAWL';
  cron: string;
  active: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastJobId: string | null;
  nextRunAt: string | null;
  runCount: number;
  enableChangeDetection: boolean;
  lastContentHash: string | null;
  webhookUrl: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleRequest {
  name: string;
  type: 'SCRAPE' | 'CRAWL';
  cron: string;
  config: Record<string, unknown>;
  enableChangeDetection?: boolean;
  webhookUrl?: string;
}

export interface UpdateScheduleRequest {
  name?: string;
  cron?: string;
  config?: Record<string, unknown>;
  active?: boolean;
}

export interface ScheduleMutationResponse {
  success: boolean;
}
