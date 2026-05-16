import { randomBytes } from 'node:crypto';
import { AppError } from '../../shared/errors/index.js';
import { OAUTH_STATE_TTL_MS, SESSION_TTL_MS } from './constants.js';
import { createSessionCookieHeader, parseCookieToken } from './cookies.js';
import type { AuthSession } from './types.js';

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
  return createSessionCookieHeader(session.token, Math.floor(SESSION_TTL_MS / 1000));
}

export function deleteSessionByToken(token: string): void {
  sessionStore.delete(token);
}
