import { fetchInitialSession } from '@/features/auth/server/initial-session';
import { DashboardApp } from '@/features/dashboard/components/dashboard-app';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { initialSession, fetchedAt } = await fetchInitialSession();
  return <DashboardApp initialSession={initialSession} initialSessionFetchedAt={fetchedAt} />;
}
