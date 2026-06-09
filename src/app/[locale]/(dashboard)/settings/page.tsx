import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { SettingsClient } from './_components/settings-client';
import { PtPolicySettings } from './_components/pt-policy-settings';

type Props = { params: { locale: string } };

export default async function SettingsPage({ params }: Props) {
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

  // Fetch membership plans
  const { data: plans } = await supabase
    .from('membership_plans')
    .select('*')
    .order('duration_days', { ascending: true });

  // Fetch disciplines with their belt hierarchies
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('*, belt_hierarchies(*)')
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

      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-12 bg-gray-100 rounded-xl" />
            <div className="h-64 bg-gray-100 rounded-2xl" />
          </div>
        }
      >
        <SettingsClient
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
