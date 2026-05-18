const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const CSRF_COOKIE_NAME = 'applejp_csrf_token';

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === CSRF_COOKIE_NAME && value) {
      return value;
    }
  }

  return null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'API request failed');
  }
  return data as T;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrfToken = method === 'GET' ? null : getCsrfTokenFromCookie();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(init?.headers ?? {})
    }
  });

  return parseResponse<T>(response);
}
