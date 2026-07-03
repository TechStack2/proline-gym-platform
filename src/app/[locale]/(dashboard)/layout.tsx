import { getMessages } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardLayoutClient } from './_components/DashboardLayoutClient';
import { FrontDeskOfflineLayer } from '@/components/offline/front-desk-offline-layer';

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login`);
  }

  const role = (await getUserRole(supabase, user.id)) as 'owner' | 'head_coach' | 'coach' | 'receptionist' | 'student' | 'parent' | 'external_coach';

  return (
    <>
      {/* OFF-1: one shared offline layer (banner + installable-PWA affordance) for
          the single shell on every viewport. */}
      <FrontDeskOfflineLayer locale={locale} />

      {/* DOUBLE-SHELL: {children} is mounted ONCE. The old layout rendered the whole
          subtree twice (block md:hidden mobile shell + hidden md:flex desktop shell)
          → double data-fetch/polling (two NotificationBells), duplicate DOM ids (two
          #pay-amount-usd on invoice detail), double offline-flush listeners. The
          chrome (NativeHeader/TabBar mobile vs Sidebar/Header desktop) is now
          responsive INSIDE DashboardLayoutClient, around one subtree — the
          PortalLayoutClient pattern. */}
      <DashboardLayoutClient locale={locale} role={role}>
        {children}
      </DashboardLayoutClient>
    </>
  );
}
