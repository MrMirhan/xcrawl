export interface ProxyConfig {
  id: string;
  url: string;
  protocol: string;
  country: string | null;
  active: boolean;
  lastCheck: string | null;
  failCount: number;
  createdAt: string;
}

export interface AddProxyRequest {
  url: string;
  protocol?: string;
  country?: string;
}

export interface ProxyTestResult {
  success: boolean;
  latency?: number;
  error?: string;
}

export interface ProxyMutationResponse {
  success: boolean;
}
