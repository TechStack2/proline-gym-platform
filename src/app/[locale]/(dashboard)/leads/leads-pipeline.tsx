import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { LeadsClient } from './leads-client';
import type {
  Lead,
  Discipline,
  GymCoach,
  MembershipPlan,
  TrialInfo,
  InviteInfo,
} from './leads-types';
import { COUNTABLE_STATUSES, STATUS_COLORS, SOURCE_ICONS } from './leads-types';

type Props = {
  locale: string;
  searchParams: { search?: string; status?: string };
};

/**
 * The lead pipeline (23R), re-homed (IA-2) as the "Prospects" tab of the
 * Members workspace — a lead is a person-status, not a separate world.
 * Extracted verbatim from the old /leads page (same queries, same LeadsClient);
 * /leads now redirects here.
 */
export async function LeadsPipeline({ locale, searchParams }: Props) {
  const supabase = await createClient();
  const t = await getTranslations('leads');
  const isRTL = locale === 'ar';

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

  // ── Server-side COUNT stats (head: true avoids row transfer) ──
  const countResults = await Promise.all([
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gymId),
    ...COUNTABLE_STATUSES.map((status) =>
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', gymId)
        .eq('status', status),
    ),
  ]);

  const counts = {
    all: countResults[0].count ?? 0,
    new: countResults[1].count ?? 0,
    contacted: countResults[2].count ?? 0,
    trial_scheduled: countResults[3].count ?? 0,
    converted: countResults[4].count ?? 0,
  };

  // ── Server-side lead query with .ilike() search ────────
  let query = supabase
    .from('leads')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false });

  if (searchParams.search) {
    const term = `%${searchParams.search}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
    );
  }

  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status);
  }

  const { data: leads } = await query;

  // ── Disciplines with gym_id filter ─────────────────────
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .eq('gym_id', gymId);

  // ── Journey data: coaches (trial assignment), active plans (convert picker),
  //    scheduled trials (lead card), simulated invites (converted members) ──
  const [coachesRes, plansRes, trialsRes, invitesRes] = await Promise.all([
    supabase.rpc('get_gym_coaches'),
    supabase
      .from('membership_plans')
      .select('id, name_ar, name_en, name_fr, duration_days, price_usd')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order('price_usd', { ascending: true }),
    // trial_classes RLS (000023) scopes to the lead's gym, so a plain select is
    // already gym-isolated.
    supabase
      .from('trial_classes')
      .select('id, lead_id, scheduled_date, scheduled_time, assigned_coach_id, status, show_up')
      .order('scheduled_date', { ascending: false }),
    supabase.from('account_invites').select('student_id, status, channel'),
  ]);

  const coaches = (coachesRes.data || []) as GymCoach[];
  const plans = (plansRes.data || []) as MembershipPlan[];
  const trials = (trialsRes.data || []) as TrialInfo[];
  const invites = (invitesRes.data || []) as InviteInfo[];

  // ── Stats data prepared for render ────────────────────
  const statsData = [
    { label: t('stats.all'), count: counts.all, color: 'bg-gray-100 text-gray-700' },
    { label: t('stats.new'), count: counts.new, color: STATUS_COLORS.new },
    { label: t('stats.contacted'), count: counts.contacted, color: STATUS_COLORS.contacted },
    { label: t('stats.trial_scheduled'), count: counts.trial_scheduled, color: STATUS_COLORS.trial_scheduled },
    { label: t('stats.converted'), count: counts.converted, color: STATUS_COLORS.converted },
  ];

  return (
    <div className="space-y-6" data-testid="leads-pipeline">
      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-3">
        {statsData.map((s) => (
          <div
            key={s.label}
            className={`text-center p-3 rounded-xl border ${s.color} bg-opacity-20`}
          >
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Client Component for search/filter/status changes */}
      <Suspense
        fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-xl" />}
      >
        <LeadsClient
          leads={(leads || []) as Lead[]}
          disciplines={(disciplines || []) as Discipline[]}
          coaches={coaches}
          plans={plans}
          trials={trials}
          invites={invites}
          gymId={gymId}
          locale={locale}
          statusColors={STATUS_COLORS}
          sourceIcons={SOURCE_ICONS}
        />
      </Suspense>
    </div>
  );
}
