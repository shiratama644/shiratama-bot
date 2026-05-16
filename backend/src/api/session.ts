import { randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';
import type { AuthSession } from './shared.js';

const DASHBOARD_COOKIE = 'applejp_dashboard_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;

const sessionStore = new Map<string, AuthSession>();
const oauthStateStore = new Map<string, number>();

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessionStore.entries()) {
    if (session.expiresAt <= now) {
      sessionStore.delete(token);
    }
  }
  for (const [state, expiresAt] of oauthStateStore.entries()) {
    if (expiresAt <= now) {
      oauthStateStore.delete(state);
    }
  }
}

export function createOAuthState(): string {
  const state = randomBytes(16).toString('hex');
  oauthStateStore.set(state, Date.now() + OAUTH_STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(state: string): boolean {
  const expiresAt = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  return Boolean(expiresAt && expiresAt > Date.now());
}

function toCookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DASHBOARD_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DASHBOARD_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
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

export function requireSession(c: { req: { header: (key: string) => string | undefined } }): AuthSession {
  cleanupExpiredSessions();
  const token = parseCookieToken(c.req.header('cookie'));
  if (!token) {
    throw new AppError('Authentication required.', 401);
  }
  const session = sessionStore.get(token);
  if (!session) {
    throw new AppError('Authentication required.', 401);
  }
  if (session.expiresAt <= Date.now()) {
    sessionStore.delete(token);
    throw new AppError('Session expired.', 401);
  }
  return session;
}

export function storeSession(session: AuthSession): string {
  sessionStore.set(session.token, session);
  return toCookieHeader(session.token, Math.floor(SESSION_TTL_MS / 1000));
}

export function deleteSessionByToken(token: string): void {
  sessionStore.delete(token);
}
