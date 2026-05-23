export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const STORAGE_KEYS = {
  TOKEN: 'xcrawl-token',
  USER: 'xcrawl-user',
  // xcrawl-api-key alias kept for backward compat; new code should use TOKEN.
  LEGACY_API_KEY: 'xcrawl-api-key',
  THEME: 'xcrawl-theme',
} as const;
