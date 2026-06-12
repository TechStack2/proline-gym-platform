import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { SettingsClient } from './_components/settings-client';
import { PtPolicySettings } from './_components/pt-policy-settings';
import Link from 'next/link';

type Props = { params: { locale: string }; searchParams?: { tab?: string } };

export default async function SettingsPage({ params, searchParams }: Props) {
  const { locale } = params;
  const t = await getTranslations('settings');
  const isRTL = locale === 'ar';
  const supabase = await createClient();

  // Fetch gym data (single row for PRO LINE Gym)
  const { data: gymData } = await supabase
    .from('gyms')
    .select('*')
    .limit(1)
    .single();

  // Fetch exchange rates, ordered by date desc
  const { data: rates } = await supabase
    .from('exchange_rates')
    .select('*')
    .order('rate_date', { ascending: false });

  // Fetch membership plans (gym-scoped: the *_read RLS is all-authenticated)
  const { data: plans } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('gym_id', gymData?.id ?? '')
    .order('duration_days', { ascending: true });

  // Fetch disciplines with their belt hierarchies (incl. archived, for the manager)
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('*, belt_hierarchies(*)')
    .eq('gym_id', gymData?.id ?? '')
    .order('sort_order', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* IA-1: Configuration row — the config destinations re-homed out of the nav. */}
      <div className="flex flex-wrap gap-2" data-testid="settings-config-row">
        <Link href={`/${locale}/disciplines`} className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'التخصصات' : locale === 'fr' ? 'Disciplines' : 'Disciplines'}
        </Link>
        <Link href={`/${locale}/belts`} className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'الأحزمة' : locale === 'fr' ? 'Ceintures' : 'Belts'}
        </Link>
        <Link href={`/${locale}/settings?tab=plans`} className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'خطط العضوية' : locale === 'fr' ? "Plans d'adhésion" : 'Membership plans'}
        </Link>
        {/* REP-1: reports re-enters the nav here (out-of-nav since IA-1; repaired). */}
        <Link href={`/${locale}/reports`} data-testid="settings-reports-link" className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'التقارير' : locale === 'fr' ? 'Rapports' : 'Reports'}
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-12 bg-gray-100 rounded-xl" />
            <div className="h-64 bg-gray-100 rounded-2xl" />
          </div>
        }
      >
        <SettingsClient
          initialTab={searchParams?.tab}
          locale={locale}
          gym={gymData}
          rates={rates || []}
          plans={plans || []}
          disciplines={disciplines || []}
        />
      </Suspense>

      {gymData && (
        <PtPolicySettings
          locale={locale}
          gymId={gymData.id}
          noShowForfeits={!!gymData.pt_no_show_forfeits}
          lateCancelWindowHours={gymData.pt_late_cancel_window_hours ?? 0}
        />
      )}
    </div>
  );
}
