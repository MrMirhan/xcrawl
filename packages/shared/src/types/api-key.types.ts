export interface ApiKeySummary {
  id: string;
  name: string;
  key: string;
  active: boolean;
  lastUsed: string | null;
  createdAt: string;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

export interface CreateApiKeyRequest {
  name: string;
}

export interface RevokeApiKeyResponse {
  success: boolean;
}
