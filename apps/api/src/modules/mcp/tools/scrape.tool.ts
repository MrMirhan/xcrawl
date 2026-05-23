import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ScrapeService } from '../../scrape/scrape.service';
import type { ScrapeRequestDto } from '../../scrape/dto/scrape-request.dto';
import { toToolResult } from './shared';

const inputSchema = {
  url: z.string().url(),
  formats: z.array(z.enum(['markdown', 'html', 'links', 'rawHtml', 'screenshot'])).optional(),
  onlyMainContent: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
};

export function registerScrapeTool(
  server: McpServer,
  service: ScrapeService,
  auth: { apiKeyId?: string; userId?: string },
): void {
  server.registerTool(
    'scrape',
    {
      title: 'Scrape a URL',
      description:
        'Fetch a single URL and return its content. Returns markdown by default. Synchronous: waits for the page and returns the data inline.',
      inputSchema,
    },
    async (args) => {
      const dto: ScrapeRequestDto = {
        url: args.url,
        formats: args.formats,
        onlyMainContent: args.onlyMainContent,
        timeout: args.timeout,
      };
      const result = await service.scrape(dto, auth.apiKeyId, auth.userId);
      return toToolResult(result);
    },
  );
}
