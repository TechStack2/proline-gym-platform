import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { PtRequestClient } from './pt-request-client';

type Props = { params: { locale: string } };

function coachName(profile: Record<string, unknown> | null, locale: string): string {
  if (!profile) return '';
  const key = `first_name_${locale}`;
  return (profile[key] as string) || (profile.first_name_en as string) || (profile.first_name_ar as string) || '';
}

export default async function PortalPtPage({ params }: Props) {
  const { locale } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single();
  const gymId = profile?.gym_id;
  if (!gymId) return null;

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const [{ data: packages }, { data: coaches }] = await Promise.all([
    supabase
      .from('pt_packages')
      .select('id, name_ar, name_en, name_fr, session_count, price_usd, price_lbp, validity_days')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order('session_count'),
    supabase
      .from('coaches')
      .select('id, profile:profiles(first_name_ar, first_name_en, first_name_fr)')
      .eq('gym_id', gymId)
      .eq('is_active', true),
  ]);

  const { data: assignments } = student
    ? await supabase
        .from('pt_assignments')
        .select('id, package_id, status, sessions_total, sessions_remaining, requested_at, rejected_reason')
        .eq('student_id', student.id)
        .order('requested_at', { ascending: false, nullsFirst: false })
    : { data: [] };

  const coachOptions = (coaches || []).map((c: Record<string, unknown>) => {
    const p = (Array.isArray(c.profile) ? c.profile[0] : c.profile) as Record<string, unknown> | null;
    return { id: c.id as string, name: coachName(p, locale) };
  });

  const t = await getTranslations('pt');

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className={cn('text-lg font-bold text-gray-900', locale === 'ar' && 'font-arabic')}>
          {t('pt_title')}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('pt_request_subtitle')}</p>
      </div>
      <PtRequestClient
        packages={packages || []}
        coaches={coachOptions}
        assignments={assignments || []}
        locale={locale}
      />
    </div>
  );
}
