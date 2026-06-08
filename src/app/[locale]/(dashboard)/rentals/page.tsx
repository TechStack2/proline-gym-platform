import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import { RentalsClient } from './rentals-client';

type Props = { params: { locale: string } };

export default async function RentalsPage({ params }: Props) {
  const { locale } = params;
  const supabase = await createClient();

  // ── Auth + gym_id for multi-tenant isolation ──────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single();

  const gymId = profile?.gym_id;
  if (!gymId) return null;

  const { data: rentals } = await supabase
    .from('rentals')
    .select('*')
    .eq('gym_id', gymId)
    .order('hourly_rate_usd');

  const { data: bookings } = await supabase
    .from('rental_bookings')
    .select('*')
    .order('start_time', { ascending: true });

  const t = await getTranslations('rentals');

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn('text-2xl font-bold text-gray-900', locale === 'ar' && 'font-arabic')}>
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('subtitle')}
        </p>
      </div>
      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-xl" />}>
        <RentalsClient rentals={rentals || []} bookings={bookings || []} locale={locale} />
      </Suspense>
    </div>
  );
}
