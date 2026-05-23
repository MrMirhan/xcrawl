import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CrawlService } from '../../crawl/crawl.service';
import type { CrawlRequestDto } from '../../crawl/dto/crawl-request.dto';
import { toErrorResult, toToolResult } from './shared';

const inputSchema = {
  url: z.string().url(),
  maxPages: z.number().int().positive().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  onlyMainContent: z.boolean().optional(),
  allowExternalLinks: z.boolean().optional(),
  allowSubdomains: z.boolean().optional(),
};

export function registerCrawlTool(
  server: McpServer,
  service: CrawlService,
  auth: { apiKeyId?: string; userId?: string },
): void {
  server.registerTool(
    'crawl',
    {
      title: 'Start a crawl job',
      description:
        'Start an asynchronous crawl of a site starting from the given URL. Returns a job id. Use getJob to poll status and fetch results.',
      inputSchema,
    },
    async (args) => {
      try {
        const dto = args as CrawlRequestDto;
        const result = await service.startCrawl(dto, auth.apiKeyId, auth.userId);
        return toToolResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
}
