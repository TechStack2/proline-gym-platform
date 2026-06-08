import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { NotificationsClient } from './notifications-client';

type Props = { params: { locale: string } };

export default async function NotificationsPage({ params }: Props) {
  const { locale } = params;
  const t = await getTranslations('notifications');
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">
          {t('signInRequired')}
        </p>
      </div>
    );
  }

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <Suspense fallback={
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    }>
      <NotificationsClient
        notifications={(notifications as any[]) || []}
        locale={locale}
      />
    </Suspense>
  );
}
