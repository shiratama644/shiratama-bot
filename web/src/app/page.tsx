import { DashboardApp } from '@/components/dashboard-app';
import type { AuthSession } from '@/lib/api';
import { cookies } from 'next/headers';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

async function fetchInitialSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {})
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AuthSession;
  } catch {
    return null;
  }
}

export default async function Home() {
  const initialSession = await fetchInitialSession();
  return <DashboardApp initialSession={initialSession} />;
}
