import { randomBytes } from 'node:crypto';
import type { Hono } from 'hono';
import { getRedis } from '../../redis/client.js';

const CSRF_COOKIE_NAME = 'applejp_csrf_token';
const CSRF_TOKEN_BYTES = 24;
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_AUTH = 30;
const RATE_LIMIT_MAX_MUTATION = 120;
// Upper bound for API JSON payloads to prevent accidental/abusive oversized submissions.
const MAX_REQUEST_BODY_BYTES = 50 * 1024;
const REQUEST_BODY_REQUIRED_PATHS = [
  '/api/giveaways',
  '/api/settings/'
] as const;

function parseCookie(header: string | undefined, key: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === key && value) {
      return value;
    }
  }
  return null;
}

function getClientIp(forwardedFor: string | undefined, realIp: string | undefined): string {
  const xff = forwardedFor?.split(',')[0]?.trim();
  return xff || realIp || 'unknown';
}

function shouldUseSecureCookie(c: { req: { header: (key: string) => string | undefined } }): boolean {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  const proto = c.req.header('x-forwarded-proto')?.toLowerCase();
  return proto === 'https';
}

function getRateLimit(path: string, method: string): number {
  if (path.startsWith('/api/auth/login') || path.startsWith('/api/auth/callback')) {
    return RATE_LIMIT_MAX_AUTH;
  }
  if (STATE_CHANGING_METHODS.has(method)) {
    return RATE_LIMIT_MAX_MUTATION;
  }
  return RATE_LIMIT_MAX_MUTATION * 2;
}

function requiresBody(method: string, path: string): boolean {
  if (!STATE_CHANGING_METHODS.has(method)) {
    return false;
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    return false;
  }
  return REQUEST_BODY_REQUIRED_PATHS.some((prefix) => path.startsWith(prefix));
}

async function passRateLimit(key: string, limit: number): Promise<boolean> {
  const redis = getRedis();
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.pexpire(redisKey, RATE_LIMIT_WINDOW_MS);
  }
  return count <= limit;
}

export function registerSecurityMiddleware(app: Hono): void {
  app.use('/api/*', async (c, next) => {
    c.header('X-Frame-Options', 'DENY');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (process.env.NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    const ip = getClientIp(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'));
    const limitKey = `${ip}:${path}:${method}`;
    const limit = getRateLimit(path, method);
    try {
      if (!(await passRateLimit(limitKey, limit))) {
        return c.json({ error: 'Too many requests.' }, 429);
      }
    } catch {
      return c.json({ error: 'Rate limit service is unavailable.' }, 503);
    }

    const contentLength = Number(c.req.header('content-length') ?? '0');
    const hasContentLength = c.req.header('content-length') != null;
    const hasTransferEncoding = c.req.header('transfer-encoding') != null;
    if (requiresBody(method, path) && !hasContentLength && !hasTransferEncoding) {
      return c.json({ error: 'Content-Length header is required for this request.' }, 411);
    }
    if (!Number.isNaN(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
      return c.json({ error: 'Request payload too large.' }, 413);
    }

    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = c.req.header('origin');
    if (STATE_CHANGING_METHODS.has(method) && allowedOrigin && requestOrigin !== allowedOrigin) {
      return c.json({ error: 'Invalid request origin.' }, 403);
    }

    const cookieHeader = c.req.header('cookie');
    let csrfToken = parseCookie(cookieHeader, CSRF_COOKIE_NAME);
    if (!csrfToken) {
      csrfToken = randomBytes(CSRF_TOKEN_BYTES).toString('hex');
      const secure = shouldUseSecureCookie(c) ? '; Secure' : '';
      c.header('Set-Cookie', `${CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${secure}`);
    }
    if (STATE_CHANGING_METHODS.has(method)) {
      const requestToken = c.req.header('x-csrf-token');
      if (!requestToken || requestToken !== csrfToken) {
        return c.json({ error: 'CSRF token is missing or invalid.' }, 403);
      }
    }

    await next();
  });
}
