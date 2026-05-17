import { DashboardApp } from '@/components/dashboard-app';
import type { AuthGuild, AuthSession } from '@/lib/api';
import { cookies } from 'next/headers';
import { z } from 'zod';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

const authGuildSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.string().nullable(),
  canUseDashboard: z.boolean(),
  canCreateGiveaway: z.boolean(),
  isOwner: z.boolean()
}) satisfies z.ZodType<AuthGuild>;

const authSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    avatarUrl: z.string().min(1)
  }),
  guilds: z.array(authGuildSchema)
}) satisfies z.ZodType<AuthSession>;

async function fetchInitialSession(): Promise<{ initialSession: AuthSession | null; fetchedAt: number }> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (!cookieHeader) {
      return { initialSession: null, fetchedAt: Date.now() };
    }
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
      headers: {
        cookie: cookieHeader
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000)
    });

    if (!response.ok) {
      console.error('Failed to fetch SSR auth session:', response.status);
      return { initialSession: null, fetchedAt: Date.now() };
    }

    const parsed = authSessionSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error('Invalid SSR auth session payload');
      return { initialSession: null, fetchedAt: Date.now() };
    }
    return { initialSession: parsed.data, fetchedAt: Date.now() };
  } catch (error) {
    console.error('SSR auth session fetch error:', error);
    return { initialSession: null, fetchedAt: Date.now() };
  }
}

export default async function Home() {
  const { initialSession, fetchedAt } = await fetchInitialSession();
  return <DashboardApp initialSession={initialSession} initialSessionFetchedAt={fetchedAt} />;
}
