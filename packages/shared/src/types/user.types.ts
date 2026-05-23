export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  settings?: UserSettings | null;
  _count?: {
    apiKeys: number;
    jobs: number;
    schedules: number;
  };
}

export interface UserSettings {
  id: string;
  userId: string;
  proxyUrls: string[];
  llmProvider: string | null;
  llmApiKey: string | null;
  llmModel: string | null;
  llmBaseUrl: string | null;
  searxngUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserSettingsRequest {
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  searxngUrl?: string;
  proxyUrls?: string[];
}

export interface TestLlmRequest {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface TestLlmResponse {
  success: boolean;
  message?: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name?: string;
}

export interface SigninRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  token: string;
}
