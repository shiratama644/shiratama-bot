import crypto from 'crypto';

export interface UserSession {
  userId: string;
  username: string;
  avatar: string | null;
}

interface JwtPayload extends UserSession {
  iat: number;
  exp: number;
}

function toBase64url(input: Buffer): string {
  return input.toString('base64url');
}

export function createSessionToken(
  user: UserSession,
  secret: string,
  expiresInSeconds = 7 * 24 * 3600
): string {
  const header = toBase64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    ...user,
    iat: now,
    exp: now + expiresInSeconds
  };
  const body = toBase64url(Buffer.from(JSON.stringify(payload)));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): UserSession | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (signature.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, username: payload.username, avatar: payload.avatar };
  } catch {
    return null;
  }
}

export function getDiscordAvatarUrl(userId: string, avatar: string | null): string {
  if (!avatar) {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`;
}
