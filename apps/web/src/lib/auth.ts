import type { AuthResponse, UserRole } from '@xcrawl/shared';
import { API_BASE, STORAGE_KEYS } from './config';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
}

export async function signup(email: string, password: string, name?: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/v1/user/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || 'Signup failed');
  }
  return res.json();
}

export async function signin(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(`${API_BASE}/api/v1/user/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || 'Invalid credentials');
  }
  return res.json();
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveAuth(user: AuthUser, token: string) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  // Mirrored for legacy pages that still read xcrawl-api-key directly.
  localStorage.setItem(STORAGE_KEYS.LEGACY_API_KEY, token);
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.LEGACY_API_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
