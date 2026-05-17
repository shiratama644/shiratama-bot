import { DASHBOARD_COOKIE } from './constants.js';

function getConfiguredUrlProtocols(): string[] {
  return [
    process.env.APP_BASE_URL,
    process.env.WEB_BASE_URL,
    process.env.CORS_ORIGIN
  ]
    .flatMap((value) => {
      if (!value) {
        return [];
      }
      try {
        return [new URL(value).protocol];
      } catch {
        return [];
      }
    });
}

function shouldUseSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.COOKIE_SECURE === 'false') {
    return false;
  }
  const protocols = getConfiguredUrlProtocols();
  if (protocols.includes('https:')) {
    return true;
  }
  if (protocols.length > 0 && protocols.every((protocol) => protocol === 'http:')) {
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
