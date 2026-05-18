import { fetchInitialSession } from '@/features/auth/server/fetch-initial-session';
import { DashboardApp } from '@/features/dashboard/components/dashboard-app';

export default async function Home() {
  const { initialSession, fetchedAt } = await fetchInitialSession();
  return <DashboardApp initialSession={initialSession} initialSessionFetchedAt={fetchedAt} />;
}
