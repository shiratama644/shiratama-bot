import type { Client } from 'discord.js';
import type { Hono } from 'hono';
import { AppError, getErrorMessage } from '../../shared/errors/index.js';
import {
  buildRedirectUri,
  cleanupExpiredSessions,
  clearCookieHeader,
  consumeOAuthState,
  createOAuthState,
  createSessionFromOAuth,
  deleteSessionByToken,
  parseCookieToken,
  requireSession,
  storeSession
} from '../../features/auth/index.js';
import { respondError } from '../utils/response.js';

export function registerAuthRoutes(app: Hono, client: Client): void {
  app.get('/api/auth/login', (c) => {
    try {
      cleanupExpiredSessions();
      const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
      const redirectUri = buildRedirectUri();
      if (!clientId) {
        throw new AppError('DISCORD_OAUTH_CLIENT_ID is required.', 500);
      }
      const state = createOAuthState();
      const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', clientId);
      authorizeUrl.searchParams.set('scope', 'identify guilds');
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('prompt', 'consent');
      authorizeUrl.searchParams.set('state', state);
      return c.redirect(authorizeUrl.toString(), 302);
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/auth/callback', async (c) => {
    try {
      cleanupExpiredSessions();
      const code = c.req.query('code');
      const state = c.req.query('state');
      const webBaseUrl = (process.env.WEB_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
      if (!code || !state) {
        throw new AppError('Invalid OAuth callback parameters.', 400);
      }
      if (!consumeOAuthState(state)) {
        throw new AppError('OAuth state is invalid or expired.', 400);
      }

      const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
      const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new AppError('Discord OAuth client credentials are missing.', 500);
      }

      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: buildRedirectUri()
        })
      });

      if (!tokenResponse.ok) {
        throw new AppError('Failed to exchange OAuth code.', 401);
      }

      const tokenPayload = await tokenResponse.json() as { access_token: string };
      const session = await createSessionFromOAuth(client, tokenPayload.access_token);
      c.header('Set-Cookie', storeSession(session));
      return c.redirect(webBaseUrl || '/', 302);
    } catch (error) {
      const webBaseUrl = (process.env.WEB_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
      if (webBaseUrl) {
        return c.redirect(`${webBaseUrl}/?authError=${encodeURIComponent(getErrorMessage(error))}`, 302);
      }
      return respondError(c, error);
    }
  });

  app.post('/api/auth/logout', (c) => {
    try {
      const token = parseCookieToken(c.req.header('cookie'));
      if (token) {
        deleteSessionByToken(token);
      }
      c.header('Set-Cookie', clearCookieHeader());
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/auth/session', (c) => {
    try {
      const session = requireSession(c);
      return c.json({
        user: session.user,
        guilds: session.guilds
      });
    } catch (error) {
      return respondError(c, error);
    }
  });
}
