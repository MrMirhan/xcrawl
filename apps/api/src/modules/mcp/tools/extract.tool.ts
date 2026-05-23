import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtractService } from '../../extract/extract.service';
import type { ExtractRequestDto } from '../../extract/dto/extract-request.dto';
import { toErrorResult, toToolResult } from './shared';

const inputSchema = {
  urls: z.array(z.string().url()).min(1),
  schema: z.record(z.string(), z.unknown()).optional(),
  prompt: z.string().optional(),
};

export function registerExtractTool(
  server: McpServer,
  service: ExtractService,
  auth: { apiKeyId?: string; userId?: string },
): void {
  server.registerTool(
    'extract',
    {
      title: 'Start an extract job',
      description:
        'Start an asynchronous LLM extraction over a list of URLs. Provide either a JSON schema or a natural language prompt (or both). Returns a job id — use getJob to poll status and fetch results.',
      inputSchema,
    },
    async (args) => {
      try {
        const dto: ExtractRequestDto = {
          urls: args.urls,
          schema: args.schema,
          prompt: args.prompt,
        };
        const result = await service.startExtract(dto, auth.apiKeyId, auth.userId);
        return toToolResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
}
