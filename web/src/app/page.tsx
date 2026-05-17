import { DashboardApp } from '@/components/dashboard-app';
import type { AuthSession } from '@/lib/api';
import { cookies } from 'next/headers';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

function parseAuthSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const session = value as Partial<AuthSession>;
  const user = session.user as Partial<AuthSession['user']> | undefined;
  if (
    !user ||
    typeof user.id !== 'string' ||
    typeof user.name !== 'string' ||
    typeof user.avatarUrl !== 'string'
  ) {
    return null;
  }
  if (!Array.isArray(session.guilds)) {
    return null;
  }
  return session as AuthSession;
}

async function fetchInitialSession(): Promise<{ initialSession: AuthSession | null; fetchedAt: number }> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {})
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000)
    });

    if (!response.ok) {
      console.error('Failed to fetch SSR auth session:', response.status);
      return { initialSession: null, fetchedAt: Date.now() };
    }

    const payload = parseAuthSession(await response.json());
    if (!payload) {
      console.error('Invalid SSR auth session payload');
    }
    return { initialSession: payload, fetchedAt: Date.now() };
  } catch (error) {
    console.error('SSR auth session fetch error:', error);
    return { initialSession: null, fetchedAt: Date.now() };
  }
}

export default async function Home() {
  const { initialSession, fetchedAt } = await fetchInitialSession();
  return <DashboardApp initialSession={initialSession} initialSessionFetchedAt={fetchedAt} />;
}
