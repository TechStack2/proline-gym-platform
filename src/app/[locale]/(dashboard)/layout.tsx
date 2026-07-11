import type { Viewport } from 'next';
import { getMessages } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardLayoutClient } from './_components/DashboardLayoutClient';
import { FrontDeskOfflineLayer } from '@/components/offline/front-desk-offline-layer';
import { SentryTags } from '@/components/observability/sentry-tags';
import { DEFAULT_GYM_SLUG } from '@/lib/marketing/gym';
import { storagePublicUrl } from '@/lib/storage/public-url';

// AX-1 shell identity: per-shell PWA theme-color (staff = brand red). DS-2: now
// per light/dark — the meta theme-color media queries track the OS prefers-color-
// scheme (the app default is 'system', so they follow the in-app theme for the
// common case). Dark status bar = the #131317 ground shared by all shells.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#cd1419' },
    { media: '(prefers-color-scheme: dark)', color: '#131317' },
  ],
}

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

  // OBSERVE: the gym slug for Sentry tagging (non-identifying). TENANT-CONTENT: the SAME
  // read now also carries the user's gym name + logo so the staff shell brands by the
  // USER's gym (never a hardcoded "PRO LINE Gym" / Host). Best-effort — a null never
  // blocks the render.
  const { data: gymRow } = await supabase
    .from('profiles').select('gyms(slug, name_ar, name_en, name_fr, logo_url)').eq('id', user.id).maybeSingle();
  const rawGym = (gymRow as { gyms?: unknown } | null)?.gyms;
  const gymNode = Array.isArray(rawGym) ? rawGym[0] : rawGym;
  const g = gymNode as { slug?: string; name_ar?: string; name_en?: string; name_fr?: string; logo_url?: string } | null | undefined;
  const gymSlug = g?.slug ?? null;
  // The default gym keeps the static /logo.jpg (zero visual change); other tenants
  // resolve their own logo (or null → the shell renders an initials placeholder).
  const isDefaultGym = gymSlug === DEFAULT_GYM_SLUG;
  const gymName = (locale === 'ar' ? g?.name_ar : locale === 'fr' ? g?.name_fr : g?.name_en) || g?.name_en || '';
  const gymLogo = isDefaultGym ? '/logo.jpg' : (storagePublicUrl('avatars', g?.logo_url) || null);

  return (
    <>
      {/* OBSERVE: tag client Sentry events with gym slug + role (never user identity). */}
      <SentryTags gym={gymSlug} role={role} />
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
      <DashboardLayoutClient locale={locale} role={role} gymName={gymName} logoUrl={gymLogo}>
        {children}
      </DashboardLayoutClient>
    </>
  );
}
