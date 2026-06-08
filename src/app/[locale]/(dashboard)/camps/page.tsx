import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tent, Users, Calendar, MapPin, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { CampsClient } from './camps-client';

type Props = { params: { locale: string } };

export default async function CampsPage({ params }: Props) {
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

  const { data: camps } = await supabase
    .from('camps')
    .select('*')
    .eq('gym_id', gymId)
    .order('start_date', { ascending: true });

  const t = await getTranslations('camps');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', locale === 'ar' && 'font-arabic')}>
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-xl" />}>
        <CampsClient camps={camps || []} locale={locale} gymId={gymId} />
      </Suspense>
    </div>
  );
}
