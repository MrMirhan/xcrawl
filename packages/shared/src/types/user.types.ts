export enum UserRole {
  PENDING = 'PENDING',
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
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
  success: boolean;
  pending?: boolean;
  message?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    role: UserRole;
    isActive: boolean;
  };
  token?: string;
}
