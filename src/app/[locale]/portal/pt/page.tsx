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
    // Students can't read `coaches`/`profiles` directly (RLS); use the gym-scoped
    // SECURITY DEFINER reader so the "preferred coach" dropdown is populated.
    supabase.rpc('get_gym_coaches'),
  ]);

  const { data: assignments } = student
    ? await supabase
        .from('pt_assignments')
        .select('id, package_id, status, sessions_total, sessions_remaining, requested_at, rejected_reason')
        .eq('student_id', student.id)
        .order('requested_at', { ascending: false, nullsFirst: false })
    : { data: [] };

  // C1: PT session history (definer reader resolves the coach name; RLS-scoped).
  const { data: sessions } = student ? await supabase.rpc('get_student_pt_sessions') : { data: [] };
  const sessionList = (sessions || []) as Array<{
    session_id: string; coach_name: string; scheduled_at: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  }>;
  const totalRemaining = (assignments || []).reduce(
    (sum: number, a: { sessions_remaining: number | null }) => sum + (a.sessions_remaining ?? 0),
    0,
  );
  const sessionStatusStyle: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-600',
    no_show: 'bg-red-100 text-red-700',
  };

  const coachOptions = (coaches || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: coachName(c, locale),
  }));

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

      {/* C1 — PT session history + remaining credits (RLS-scoped, RTL) */}
      <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="portal-pt-history">
        <div className="flex items-center justify-between mb-3">
          <h2 className={cn('text-sm font-bold text-gray-900', locale === 'ar' && 'font-arabic')}>
            {t('pt_sessions_title')}
          </h2>
          <span
            data-testid="portal-pt-remaining"
            className="text-xs px-2 py-0.5 rounded-full bg-[#cd1419]/10 text-[#cd1419] font-medium"
          >
            {t('credits_remaining', { count: totalRemaining })}
          </span>
        </div>
        {sessionList.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t('no_sessions')}</p>
        ) : (
          <div className="space-y-2">
            {sessionList.map((s) => (
              <div
                key={s.session_id}
                data-testid="portal-pt-session"
                data-status={s.status}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-700">{s.coach_name || '—'}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(s.scheduled_at).toLocaleDateString(locale === 'ar' ? 'ar-LB' : 'en-US')}
                  </p>
                </div>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', sessionStatusStyle[s.status])}>
                  {t(`session_status.${s.status}` as Parameters<typeof t>[0])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
