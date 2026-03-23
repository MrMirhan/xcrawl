export interface ExtractRequest {
  urls: string[];
  schema?: Record<string, unknown>;
  prompt?: string;
  llm?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
}

export interface ExtractResponse {
  success: boolean;
  data: unknown;
}
