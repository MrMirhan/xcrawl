import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JobService } from '../../job/job.service';
import { toErrorResult, toToolResult } from './shared';

const getJobInputSchema = {
  id: z.string().min(1),
};

const listJobsInputSchema = {
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  type: z.enum(['SCRAPE', 'CRAWL', 'BATCH_SCRAPE', 'MAP', 'EXTRACT']).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL']).optional(),
};

export function registerJobTools(
  server: McpServer,
  service: JobService,
  auth: { apiKeyId?: string; userId?: string },
): void {
  server.registerTool(
    'getJob',
    {
      title: 'Get a job by id',
      description:
        'Fetch the status and (up to 50) results of an async job (crawl, extract, batch-scrape) created by this user or API key.',
      inputSchema: getJobInputSchema,
    },
    async (args) => {
      try {
        const job = await service.getJob(args.id, { userId: auth.userId, apiKeyId: auth.apiKeyId });
        return toToolResult(job);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    'listJobs',
    {
      title: 'List jobs',
      description: 'List paginated jobs owned by the caller, with optional filters by type and status.',
      inputSchema: listJobsInputSchema,
    },
    async (args) => {
      try {
        const result = await service.listJobs({
          page: args.page,
          limit: args.limit,
          type: args.type,
          status: args.status,
          userId: auth.userId,
          apiKeyId: auth.apiKeyId,
        });
        return toToolResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
}
