import { randomBytes } from 'node:crypto';
import {
  cleanupStoredAuthSessions,
  consumeStoredOAuthState,
  deleteStoredAuthSession,
  getStoredAuthSession,
  insertAuthSession,
  storeOAuthState
} from '../../redis/authStore.js';
import { AppError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { OAUTH_STATE_TTL_MS, SESSION_TTL_MS } from './constants.js';
import { createSessionCookieHeader, parseCookieToken } from './cookies.js';
import type { AuthSession } from './types.js';

const SESSION_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const SESSION_CLEANUP_SCAN_COUNT = 50;
const SESSION_CLEANUP_MAX_SCANNED_KEYS = 200;

let lastSessionCleanupAt = 0;
let cleanupInFlight: Promise<void> | null = null;

export async function cleanupExpiredSessions(): Promise<void> {
  const now = Date.now();
  if (now - lastSessionCleanupAt < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }
  if (cleanupInFlight) {
    return cleanupInFlight;
  }
  cleanupInFlight = (async () => {
    try {
      const deletedCount = await cleanupStoredAuthSessions({
        scanCount: SESSION_CLEANUP_SCAN_COUNT,
        maxScannedKeys: SESSION_CLEANUP_MAX_SCANNED_KEYS
      });
      if (deletedCount > 0) {
        logger.info('Expired or invalid auth sessions cleaned up.', { deletedCount });
      }
    } catch (error) {
      logger.warn('Auth session cleanup failed.', { error });
    } finally {
      lastSessionCleanupAt = Date.now();
      cleanupInFlight = null;
    }
  })();
  return cleanupInFlight;
}

export async function createOAuthState(): Promise<string> {
  const state = randomBytes(16).toString('hex');
  await storeOAuthState(state, OAUTH_STATE_TTL_MS);
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
