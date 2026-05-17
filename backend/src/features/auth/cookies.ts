import { DASHBOARD_COOKIE } from './constants.js';

function shouldUseSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.COOKIE_SECURE === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

function buildCookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = shouldUseSecureCookie() ? '; Secure' : '';
  return `${DASHBOARD_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function createSessionCookieHeader(token: string, maxAgeSeconds: number): string {
  return buildCookieHeader(token, maxAgeSeconds);
}

export function clearCookieHeader(): string {
  return buildCookieHeader('', 0);
}

export function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const chunk of cookieHeader.split(';')) {
    const [name, value] = chunk.trim().split('=');
    if (name === DASHBOARD_COOKIE && value) {
      return value;
    }
  }

  return null;
}
