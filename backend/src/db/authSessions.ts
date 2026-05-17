import { getDb, runDb } from './client.js';
import type { AuthGuild } from '../features/auth/types.js';

type AuthSessionPayload = {
  user: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  guilds: AuthGuild[];
};

export async function deleteExpiredAuthArtifacts(now: Date): Promise<void> {
  await runDb(async () => {
    await getDb()
      .deleteFrom('auth_sessions')
      .where('expires_at', '<=', now)
      .execute();

    await getDb()
      .deleteFrom('oauth_states')
      .where('expires_at', '<=', now)
      .execute();
  }, 'deleteExpiredAuthArtifacts');
}

export async function insertOAuthState(state: string, expiresAt: Date): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('oauth_states')
      .values({
        state,
        expires_at: expiresAt
      })
      .execute();
  }, 'insertOAuthState');
}

export async function consumeStoredOAuthState(state: string): Promise<boolean> {
  return runDb(async () => {
    const deleted = await getDb()
      .deleteFrom('oauth_states')
      .where('state', '=', state)
      .returning('expires_at')
      .executeTakeFirst();

    return Boolean(deleted && deleted.expires_at.getTime() > Date.now());
  }, 'consumeStoredOAuthState');
}

export async function insertAuthSession(params: {
  token: string;
  payload: AuthSessionPayload;
  expiresAt: Date;
}): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('auth_sessions')
      .values({
        token: params.token,
        session_json: JSON.stringify(params.payload),
        expires_at: params.expiresAt
      })
      .execute();
  }, 'insertAuthSession');
}

export async function getStoredAuthSession(token: string): Promise<{
  token: string;
  user: AuthSessionPayload['user'];
  guilds: AuthSessionPayload['guilds'];
  expiresAt: number;
} | null> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('auth_sessions')
      .selectAll()
      .where('token', '=', token)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    if (row.expires_at.getTime() <= Date.now()) {
      await getDb()
        .deleteFrom('auth_sessions')
        .where('token', '=', token)
        .execute();
      return null;
    }

    const payload = JSON.parse(row.session_json) as AuthSessionPayload;
    return {
      token: row.token,
      user: payload.user,
      guilds: payload.guilds,
      expiresAt: row.expires_at.getTime()
    };
  }, 'getStoredAuthSession');
}

export async function deleteStoredAuthSession(token: string): Promise<void> {
  await runDb(async () => {
    await getDb()
      .deleteFrom('auth_sessions')
      .where('token', '=', token)
      .execute();
  }, 'deleteStoredAuthSession');
}
