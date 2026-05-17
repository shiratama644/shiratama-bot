import { DashboardApp } from '@/components/dashboard-app';
import type { AuthSession } from '@/lib/api';
import { cookies } from 'next/headers';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

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

    return {
      initialSession: (await response.json()) as AuthSession,
      fetchedAt: Date.now()
    };
  } catch (error) {
    console.error('SSR auth session fetch error:', error);
    return { initialSession: null, fetchedAt: Date.now() };
  }
}

export default async function Home() {
  const { initialSession, fetchedAt } = await fetchInitialSession();
  return <DashboardApp initialSession={initialSession} initialSessionFetchedAt={fetchedAt} />;
}
