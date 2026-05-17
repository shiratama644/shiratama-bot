import { randomBytes } from 'node:crypto';
import {
  consumeStoredOAuthState,
  deleteExpiredAuthArtifacts,
  deleteStoredAuthSession,
  getStoredAuthSession,
  insertAuthSession,
  insertOAuthState
} from '../../db/index.js';
import { AppError } from '../../shared/errors/index.js';
import { OAUTH_STATE_TTL_MS, SESSION_TTL_MS } from './constants.js';
import { createSessionCookieHeader, parseCookieToken } from './cookies.js';
import type { AuthSession } from './types.js';

export async function cleanupExpiredSessions(): Promise<void> {
  await deleteExpiredAuthArtifacts(new Date());
}

export async function createOAuthState(): Promise<string> {
  const state = randomBytes(16).toString('hex');
  await insertOAuthState(state, new Date(Date.now() + OAUTH_STATE_TTL_MS));
  return state;
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  return consumeStoredOAuthState(state);
}

export async function requireSession(c: {
  req: { header: (key: string) => string | undefined };
}): Promise<AuthSession> {
  await cleanupExpiredSessions();
  const token = parseCookieToken(c.req.header('cookie'));
  if (!token) {
    throw new AppError('Authentication required.', 401);
  }
  const session = await getStoredAuthSession(token);
  if (!session) {
    throw new AppError('Authentication required.', 401);
  }
  return session;
}

export async function storeSession(session: AuthSession): Promise<string> {
  await insertAuthSession({
    token: session.token,
    payload: {
      user: session.user,
      guilds: session.guilds
    },
    expiresAt: new Date(session.expiresAt)
  });
  return createSessionCookieHeader(session.token, Math.floor(SESSION_TTL_MS / 1000));
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await deleteStoredAuthSession(token);
}
