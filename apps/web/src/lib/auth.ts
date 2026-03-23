const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export async function signup(email: string, password: string, name?: string): Promise<{ user: AuthUser; token: string }> {
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
  return localStorage.getItem('xcrawl-token');
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('xcrawl-user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveAuth(user: AuthUser, token: string) {
  localStorage.setItem('xcrawl-token', token);
  localStorage.setItem('xcrawl-user', JSON.stringify(user));
  // Also set as API key for backward compatibility
  localStorage.setItem('xcrawl-api-key', token);
}

export function clearAuth() {
  localStorage.removeItem('xcrawl-token');
  localStorage.removeItem('xcrawl-user');
  localStorage.removeItem('xcrawl-api-key');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
