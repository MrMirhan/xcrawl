import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearchService } from '../../search/search.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SearchRequestDto } from '../../search/dto/search-request.dto';
import { toErrorResult, toToolResult } from './shared';

const inputSchema = {
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  formats: z.array(z.string()).optional(),
};

export function registerSearchTool(
  server: McpServer,
  service: SearchService,
  prisma: PrismaService,
  auth: { userId?: string },
): void {
  server.registerTool(
    'search',
    {
      title: 'Search the web',
      description:
        'Run a web search and scrape the top results. Uses SearXNG when configured per user, otherwise DuckDuckGo.',
      inputSchema,
    },
    async (args) => {
      try {
        const dto: SearchRequestDto = {
          query: args.query,
          limit: args.limit,
          formats: args.formats,
        };
        if (auth.userId) {
          const settings = await prisma.userSettings.findUnique({
            where: { userId: auth.userId },
            select: { searxngUrl: true },
          });
          if (settings?.searxngUrl) dto.searxngUrl = settings.searxngUrl;
        }
        const result = await service.search(dto);
        return toToolResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
}
