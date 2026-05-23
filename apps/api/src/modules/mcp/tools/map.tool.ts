import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MapService } from '../../map/map.service';
import { toErrorResult, toToolResult } from './shared';

const inputSchema = {
  url: z.string().url(),
  search: z.string().optional(),
  limit: z.number().int().positive().optional(),
  includeSitemap: z.boolean().optional(),
};

export function registerMapTool(server: McpServer, service: MapService): void {
  server.registerTool(
    'map',
    {
      title: 'Discover URLs on a site',
      description:
        'Discover URLs reachable from the given URL. Optionally filter by a search term. Returns a list of links.',
      inputSchema,
    },
    async (args) => {
      try {
        const result = await service.map({
          url: args.url,
          search: args.search,
          limit: args.limit,
          includeSitemap: args.includeSitemap,
        });
        return toToolResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
}
