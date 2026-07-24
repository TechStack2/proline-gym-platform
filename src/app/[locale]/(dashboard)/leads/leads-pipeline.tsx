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
import { COUNTABLE_STATUSES, LEADS_LIMIT, STATUS_COLORS, SOURCE_ICONS } from './leads-types';
import { upcomingClassOccurrences } from '@/lib/trials/occurrences';
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

  // WL-TEMPLATES: the lead-reply wa.me message greets with this gym's name.
  const { data: gymRow } = await supabase.from('gyms').select('name_ar, name_en, name_fr').eq('id', gymId).maybeSingle();
  const gymName = gymDisplayName(gymRow, locale);

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
  // LEADS-BOUND: cap the list at the most-recent LEADS_LIMIT so a gym with thousands
  // of real leads doesn't load them all; the total comes from the count query above
  // → "Showing N of TOTAL" in LeadsClient (which applies the SAME limit on its
  // search/filter re-fetch). Concurrency stays LOW here on purpose — the reverted
  // sequential/small-batch structure; a wide Promise.all burst the pooler.
  // ORDER MATTERS: apply .limit() LAST, AFTER the .or()/.eq() FILTERS. postgrest-js
  // chains `.limit()` before `.or()` broke the .ilike() search at runtime (returned 0)
  // — filters must be built before the limit transform.
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

  const { data: leads } = await query.limit(LEADS_LIMIT);

  // ── Disciplines with gym_id filter ─────────────────────
  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name_ar, name_en, name_fr')
    .eq('gym_id', gymId)
    .eq('is_active', true);

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
      .select('id, lead_id, class_id, scheduled_date, scheduled_time, assigned_coach_id, status, show_up, classes(name_ar, name_en, name_fr)')
      .order('scheduled_date', { ascending: false }),
    supabase.from('account_invites').select('student_id, status, channel'),
  ]);

  const coaches = (coachesRes.data || []) as GymCoach[];
  const plans = (plansRes.data || []) as MembershipPlan[];
  const locName = (o: { name_ar: string; name_en: string; name_fr: string } | null | undefined) =>
    o ? (locale === 'ar' ? o.name_ar : locale === 'fr' ? o.name_fr : o.name_en) : null;
  const trials = ((trialsRes.data || []) as Array<Record<string, unknown>>).map((r) => {
    const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes;
    return { ...r, class_name: locName(cls as { name_ar: string; name_en: string; name_fr: string } | null) } as unknown as TrialInfo;
  });
  const invites = (invitesRes.data || []) as InviteInfo[];

  // ── TRIAL-SLOTS R2: upcoming class occurrences (next 2 weeks) for the trial picker ──
  const { data: schedRows } = await supabase
    .from('class_schedules')
    .select('day_of_week, start_time, end_time, valid_from, valid_until, classes!inner(id, name_ar, name_en, name_fr, coach_id, max_capacity, gym_id, is_active)')
    .eq('classes.gym_id', gymId)
    .eq('is_active', true);
  const schedList = (schedRows || []) as Array<Record<string, unknown>>;
  const clsOf = (r: Record<string, unknown>) => (Array.isArray(r.classes) ? r.classes[0] : r.classes) as {
    id: string; name_ar: string; name_en: string; name_fr: string; coach_id: string | null; max_capacity: number | null; is_active: boolean;
  };
  const classIds = [...new Set(schedList.map((r) => clsOf(r).id))];
  const { data: regRows } = classIds.length
    ? await supabase.from('class_registrations').select('class_id, status').in('class_id', classIds).eq('status', 'active')
    : { data: [] as { class_id: string }[] };
  const regCount = new Map<string, number>();
  for (const r of (regRows || []) as { class_id: string }[]) regCount.set(r.class_id, (regCount.get(r.class_id) ?? 0) + 1);
  const coachNameById = new Map(coaches.map((c) => [c.id, locale === 'ar' ? c.first_name_ar : locale === 'fr' ? c.first_name_fr : c.first_name_en]));
  const todayISO = new Date().toISOString().slice(0, 10);
  const occurrences = upcomingClassOccurrences(
    schedList.filter((r) => clsOf(r).is_active).map((r) => {
      const c = clsOf(r);
      return {
        classId: c.id, className: locName(c) ?? '', coachId: c.coach_id, coachName: (c.coach_id && coachNameById.get(c.coach_id)) || '',
        maxCapacity: c.max_capacity, activeRegCount: regCount.get(c.id) ?? 0,
        dayOfWeek: r.day_of_week as number, startTime: r.start_time as string, endTime: r.end_time as string,
        validFrom: (r.valid_from as string | null) ?? null, validUntil: (r.valid_until as string | null) ?? null,
      };
    }),
    todayISO, 14,
  );

  // GRW-1: the growth funnel (this month) — conversion rate + by-source/campaign.
  const funnel = await getFunnel(supabase, gymId, monthStartISO());

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

      {/* Stage chips (clickable counts → server-side status filter).
          MONEY-MOBILE §2: at 390px five fixed columns squeezed each tile below its
          min-content and clipped "Trial Scheduled" off the right edge. Wrap the row
          responsively (2 → 3 → 5) so every tile stays fully readable and the page
          body never scrolls horizontally; the desktop 5-across is preserved (≥lg). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statsData.map((s) => (
          <Link
            key={s.key}
            href={`/${locale}/students?tab=prospects${s.key === 'all' ? '' : `&status=${s.key}`}`}
            data-testid={`prospect-chip-${s.key}`}
            data-count={s.count}
            className={`min-w-0 text-center p-3 rounded-xl border ${s.color} bg-opacity-20 transition-shadow hover:shadow-md ${activeStatus === s.key ? 'ring-2 ring-primary-700/50' : ''}`}
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
          total={counts.all}
          disciplines={(disciplines || []) as Discipline[]}
          coaches={coaches}
          plans={plans}
          trials={trials}
          occurrences={occurrences}
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
