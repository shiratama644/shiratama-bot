import { apiFetch, getApiBaseUrl } from '@/lib/api/client';
import type { AuthSession } from '@/features/auth/types';

export function getLoginUrl() {
  return `${getApiBaseUrl()}/api/auth/login`;
}

export async function fetchAuthSession() {
  return apiFetch<AuthSession>('/api/auth/session');
}

export async function logout() {
  return apiFetch<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST'
  });
}
