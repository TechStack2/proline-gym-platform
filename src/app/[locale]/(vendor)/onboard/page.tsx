import { setRequestLocale } from 'next-intl/server';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardForm } from './onboard-form';

// Super-admin surface — always per-request (reads the caller's session + gate).
export const dynamic = 'force-dynamic';

/**
 * WL-ONBOARDING-WIZARD gated route (SUPER-ADMIN ONLY). Server-side gate: anon →
 * login; any authenticated non-platform-admin → notFound() (404 — the route is
 * hidden, not merely denied). This is UI defense; onboardGym RE-ASSERTS the same
 * is_platform_admin() gate server-side (never client-trusted).
 */
export default async function OnboardPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (isAdmin !== true) notFound();
  return <OnboardForm locale={locale} />;
}
