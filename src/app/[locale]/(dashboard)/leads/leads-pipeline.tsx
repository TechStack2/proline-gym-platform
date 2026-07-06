import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { gymDisplayName } from '@/lib/whatsapp/identity';
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
import { FunnelStrip } from './funnel-strip';
import { getFunnel, monthStartISO } from '@/lib/growth/funnel';
import { Megaphone } from 'lucide-react';

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

  // ── Server-side lead query with .ilike() search — built here (sync), fetched below ──
  let leadsQuery = supabase
    .from('leads')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false });

  if (searchParams.search) {
    const term = `%${searchParams.search}%`;
    leadsQuery = leadsQuery.or(
      `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
    );
  }

  if (searchParams.status && searchParams.status !== 'all') {
    leadsQuery = leadsQuery.eq('status', searchParams.status);
  }

  // PERF-SSR: everything below only needs gymId and is INDEPENDENT — the gym-name row,
  // the COUNT stats, the lead list, disciplines, the journey batch (coaches/plans/trials/
  // invites), and the growth funnel. Fetch them in ONE parallel wave instead of 6
  // sequential awaits (this is the prospects/leads SSR that stalled under --repeat-each
  // load). Same queries + variables → identical data to the client. NOTE: the lead list
  // is still an unbounded `.select('*')` — bounding it would change what's shown (needs
  // pagination), so left as-is per the "identical data" scope; flagged as a follow-up.
  const [
    { data: gymRow },
    countResults,
    { data: leads },
    { data: disciplines },
    [coachesRes, plansRes, trialsRes, invitesRes],
    funnel,
  ] = await Promise.all([
    // WL-TEMPLATES: the lead-reply wa.me message greets with this gym's name.
    supabase.from('gyms').select('name_ar, name_en, name_fr').eq('id', gymId).maybeSingle(),
    // Server-side COUNT stats (head: true avoids row transfer)
    Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('gym_id', gymId),
      ...COUNTABLE_STATUSES.map((status) =>
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', status),
      ),
    ]),
    // The lead list (search/status filters applied above)
    leadsQuery,
    // Disciplines with gym_id filter
    supabase.from('disciplines').select('id, name_ar, name_en, name_fr').eq('gym_id', gymId).eq('is_active', true),
    // Journey data: coaches (trial assignment), active plans (convert picker), scheduled
    // trials (lead card), simulated invites (converted members). trial_classes RLS
    // (000023) scopes to the lead's gym, so a plain select is already gym-isolated.
    Promise.all([
      supabase.rpc('get_gym_coaches'),
      supabase
        .from('membership_plans')
        .select('id, name_ar, name_en, name_fr, duration_days, price_usd')
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .order('price_usd', { ascending: true }),
      supabase
        .from('trial_classes')
        .select('id, lead_id, scheduled_date, scheduled_time, assigned_coach_id, status, show_up')
        .order('scheduled_date', { ascending: false }),
      supabase.from('account_invites').select('student_id, status, channel'),
    ]),
    // GRW-1: the growth funnel (this month) — conversion rate + by-source/campaign.
    getFunnel(supabase, gymId, monthStartISO()),
  ]);

  const gymName = gymDisplayName(gymRow, locale);
  const counts = {
    all: countResults[0].count ?? 0,
    new: countResults[1].count ?? 0,
    contacted: countResults[2].count ?? 0,
    trial_scheduled: countResults[3].count ?? 0,
    converted: countResults[4].count ?? 0,
  };
  const coaches = (coachesRes.data || []) as GymCoach[];
  const plans = (plansRes.data || []) as MembershipPlan[];
  const trials = (trialsRes.data || []) as TrialInfo[];
  const invites = (invitesRes.data || []) as InviteInfo[];

  // ── FD-1: the stats bar is the stage FILTER — chips with counts ──
  const activeStatus = searchParams.status ?? 'all';
  const statsData = [
    { key: 'all', label: t('stats.all'), count: counts.all, color: 'bg-gray-100 text-gray-700' },
    { key: 'new', label: t('stats.new'), count: counts.new, color: STATUS_COLORS.new },
    { key: 'contacted', label: t('stats.contacted'), count: counts.contacted, color: STATUS_COLORS.contacted },
    { key: 'trial_scheduled', label: t('stats.trial_scheduled'), count: counts.trial_scheduled, color: STATUS_COLORS.trial_scheduled },
    { key: 'converted', label: t('stats.converted'), count: counts.converted, color: STATUS_COLORS.converted },
  ];

  return (
    <div className="space-y-6" data-testid="leads-pipeline">
      {/* GRW-1: Campaigns surface entry (tracked links + QR + per-campaign funnel) */}
      <div className="flex justify-end">
        <Link href={`/${locale}/campaigns`} data-testid="campaigns-link"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Megaphone className="h-4 w-4 text-primary-600" /> {t('campaignsLink')}
        </Link>
      </div>

      {/* GRW-1: growth funnel strip (conversion + by-source/campaign, this month) */}
      <FunnelStrip funnel={funnel} locale={locale} />

      {/* Stage chips (clickable counts → server-side status filter) */}
      <div className="grid grid-cols-5 gap-3">
        {statsData.map((s) => (
          <Link
            key={s.key}
            href={`/${locale}/students?tab=prospects${s.key === 'all' ? '' : `&status=${s.key}`}`}
            data-testid={`prospect-chip-${s.key}`}
            data-count={s.count}
            className={`text-center p-3 rounded-xl border ${s.color} bg-opacity-20 transition-shadow hover:shadow-md ${activeStatus === s.key ? 'ring-2 ring-[#cd1419]/50' : ''}`}
          >
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs font-medium mt-0.5">{s.label}</div>
          </Link>
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
          gymName={gymName}
          locale={locale}
          statusColors={STATUS_COLORS}
          sourceIcons={SOURCE_ICONS}
        />
      </Suspense>
    </div>
  );
}
