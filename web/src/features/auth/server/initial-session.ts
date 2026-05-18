import { cookies } from 'next/headers';
import { z } from 'zod';
import type { AuthGuild, AuthSession } from '@/features/auth/types';
import { getApiBaseUrl } from '@/lib/api/client';

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

export async function fetchInitialSession(): Promise<{
  initialSession: AuthSession | null;
  fetchedAt: number;
}> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (!cookieHeader) {
      return { initialSession: null, fetchedAt: Date.now() };
    }

    const response = await fetch(`${getApiBaseUrl()}/api/auth/session`, {
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
