import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function toToolResult(value: unknown, isError = false): CallToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function toErrorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return toToolResult({ success: false, error: message }, true);
}
