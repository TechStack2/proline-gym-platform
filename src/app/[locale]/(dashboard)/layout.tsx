import { getMessages } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { DashboardLayoutClient } from './_components/DashboardLayoutClient';
import { FrontDeskOfflineLayer } from '@/components/offline/front-desk-offline-layer';
import { SyncPrimer } from '@/components/offline/sync-primer';
import { cn } from '@/lib/utils';

// AX-1 shell identity: per-shell PWA theme-color (staff = brand red).
export const viewport = { themeColor: '#cd1419' }

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

async function getUserRole(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data?.role || 'coach';
}

export default async function DashboardLayout({ children, params }: Props) {
  const { locale } = params;
  const isRTL = locale === 'ar';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login`);
  }

  const role = (await getUserRole(supabase, user.id)) as 'owner' | 'head_coach' | 'coach' | 'receptionist' | 'student' | 'parent' | 'external_coach';

  return (
    <>
      {/* OFF-1: one shared offline layer for BOTH shells (mobile NativeTabBar +
          desktop Sidebar) → the front-desk laptop gets the same offline banner +
          installable-PWA affordance the mobile shell had. */}
      <FrontDeskOfflineLayer locale={locale} />
      {/* OFF-2: prime the Dexie mirror on login + each online window. */}
      <SyncPrimer />

      {/* ─── Mobile (≤767px): Native iOS/Android feel ─── */}
      <div className="block md:hidden h-screen">
        <DashboardLayoutClient locale={locale} role={role}>
          {children}
        </DashboardLayoutClient>
      </div>

      {/* ─── Desktop (≥768px): Sidebar + Header (existing) ─── */}
      <div className="hidden md:flex h-screen overflow-hidden">
        <Sidebar locale={locale} role={role} />

        <div className={cn('flex flex-1 flex-col overflow-hidden', isRTL ? 'lg:pr-64' : 'lg:pl-64')}>
          <Header locale={locale} role={role} />
          <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
