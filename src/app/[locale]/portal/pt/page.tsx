import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { localizedName, one } from '@/lib/names';
import { STATUS_BADGE, statusLabel } from '@/lib/billing/reconcile';
import { PtPackageCard, computePtStatus, type PtCardData } from '@/components/shared/pt-package-card';
import { PtRequestClient } from './pt-request-client';
import { BookPtModal } from '@/components/shared/book-pt-modal';
import { CancelBookingButton, MemberProposalActions } from './session-actions';
import { DeskGrid } from '@/components/portal/portal-kit';

type Props = { params: { locale: string } };

function coachName(profile: Record<string, unknown> | null, locale: string): string {
  if (!profile) return '';
  const key = `first_name_${locale}`;
  return (profile[key] as string) || (profile.first_name_en as string) || (profile.first_name_ar as string) || '';
}

/**
 * Portal "My PT" (PT-1, operator amendment §3.1) — PACKAGE-FIRST. The flat
 * "session history" wall this page used to render (loose sessions with no
 * package/coach/billing tie — the operator's complaint on Karim's account)
 * is gone: every assignment renders as a PtPackageCard (type · coach ·
 * discipline · remaining · validity countdown · invoice payment state) with
 * its sessions NESTED under it. The 22R catalog request flow stays below.
 */
export default async function PortalPtPage({ params }: Props) {
  const { locale } = params;
  const isRTL = locale === 'ar';
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
      .is('deleted_at', null)
      .order('session_count'),
    supabase.rpc('get_gym_coaches'),
  ]);

  // ── Package cards: assignments + type/discipline + coach + invoice + nested sessions ──
  const { data: assignments } = student
    ? await supabase
        .from('pt_assignments')
        .select(`id, package_id, status, sessions_total, sessions_remaining, requested_at, purchased_at, expires_at, rejected_reason, invoice_id,
          pt_packages:package_id (name_ar, name_en, name_fr, disciplines:discipline_id (name_ar, name_en, name_fr)),
          coaches:coach_id (profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr, avatar_url))`)
        .eq('student_id', student.id)
        .order('requested_at', { ascending: false, nullsFirst: false })
    : { data: [] };

  const invoiceIds = ((assignments ?? []) as any[]).map((a) => a.invoice_id).filter(Boolean);
  const { data: invoices } = invoiceIds.length
    ? await supabase.from('invoices').select('id, invoice_number, status').in('id', invoiceIds)
    : { data: [] as any[] };
  const invBy = new Map(((invoices ?? []) as any[]).map((i) => [i.id, i]));

  const { data: sessionRows } = student
    ? await supabase
        .from('pt_sessions')
        .select('id, assignment_id, scheduled_at, status, proposed_by')
        .eq('student_id', student.id)
        .order('scheduled_at', { ascending: false })
        .limit(100)
    : { data: [] as any[] };
  const sessionsBy = new Map<string, any[]>();
  for (const sRow of (sessionRows ?? []) as any[]) {
    if (!sRow.assignment_id) continue;
    const list = sessionsBy.get(sRow.assignment_id) ?? [];
    list.push(sRow);
    sessionsBy.set(sRow.assignment_id, list);
  }

  const t = await getTranslations('pt');
  const lname = (r: any) => ((isRTL ? r?.name_ar : locale === 'fr' ? r?.name_fr : r?.name_en) || r?.name_en || '');

  const cards: PtCardData[] = ((assignments ?? []) as any[]).map((a) => {
    const pkg = one(a.pt_packages);
    const inv: any = a.invoice_id ? invBy.get(a.invoice_id) : null;
    return {
      id: a.id,
      status: a.status,
      sessionsTotal: a.sessions_total ?? 0,
      sessionsRemaining: a.sessions_remaining ?? 0,
      expiresAt: a.expires_at,
      packageName: lname(pkg),
      disciplineName: pkg ? lname(one((pkg as any).disciplines)) || null : null,
      coachName: localizedName(one(one(a.coaches)?.profiles), locale) || null,
      coachAvatarUrl: one(one(a.coaches)?.profiles)?.avatar_url ?? null,
      invoiceHref: inv ? `/${locale}/portal/billing` : null,
      invoiceNumber: inv?.invoice_number ?? null,
      invoiceStatusLabel: inv ? statusLabel(inv.status, locale) : null,
      invoiceStatusClass: inv ? STATUS_BADGE[inv.status] : null,
      sessions: (sessionsBy.get(a.id) ?? []).map((sRow: any) => ({
        id: sRow.id, scheduledAt: sRow.scheduled_at, status: sRow.status,
        // PT-2 nested actions: cancel a future booking; answer a counter.
        action:
          sRow.status === 'scheduled' && new Date(sRow.scheduled_at) > new Date()
            ? <CancelBookingButton sessionId={sRow.id} />
            : sRow.status === 'proposed' && sRow.proposed_by && sRow.proposed_by !== user.id
              ? <MemberProposalActions sessionId={sRow.id} />
              : undefined,
      })),
    };
  });

  const totalRemaining = cards
    .filter((c) => computePtStatus(c) === 'active')
    .reduce((sum, c) => sum + c.sessionsRemaining, 0);

  const validityLabel = (d: PtCardData) => {
    if (!d.expiresAt) return null;
    const days = Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 864e5);
    return days >= 0 ? t('days_left', { days }) : t('expired_ago', { days: Math.abs(days) });
  };

  const coachOptions = (coaches || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: coachName(c, locale),
  }));

  return (
    <div className="p-4 space-y-4">
      <div>
        {/* W2b R3: the ONE title primitive (testid `page-title`); mobile keeps
            the always-visible subtitle line (chrome owns the mobile title). */}
        <PageHeader title={t('pt_title')} subtitle={t('pt_request_subtitle')} variant="compact" />
        <p className="text-sm text-gray-500 md:hidden">{t('pt_request_subtitle')}</p>
      </div>

      {/* W2a §4.2 Rule 1: main = my packages (the primary flow); aside = the
          catalog request section (browse-to-buy glanceable). */}
      <DeskGrid main={
      /* My PT — the package cards (sessions nested; no flat list) */
      <div className="space-y-2" data-testid="portal-pt-history">
        <div className="flex items-center justify-between">
          <h2 className={cn('text-sm font-semibold text-gray-700', isRTL && 'font-arabic')}>
            {t('my_requests')}
          </h2>
          <span
            data-testid="portal-pt-remaining"
            className="text-xs px-2 py-0.5 rounded-full bg-primary-700/10 text-primary-700 font-medium"
          >
            {t('credits_remaining', { count: totalRemaining })}
          </span>
        </div>
        {cards.length === 0 ? (
          // Guided empty: name the next step (pick a package from the catalog below).
          <div data-testid="portal-pt-empty" className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-700">{t('no_sessions')}</p>
            <p className="mt-1 text-xs text-gray-400">{t('empty_hint')}</p>
          </div>
        ) : (
          cards.map((d) => (
            <PtPackageCard
              key={d.id}
              data={d}
              locale={locale}
              testid="pt-my-request"
              sessionTestid="portal-pt-session"
              labels={{
                remainingText: t('sessions_remaining', { remaining: d.sessionsRemaining, total: d.sessionsTotal }),
                status: t(`status_${computePtStatus(d)}` as Parameters<typeof t>[0]),
                validity: validityLabel(d),
                sessionsTitle: t('pt_sessions_title'),
                sessionStatus: (s) => t(`session_status.${s}` as Parameters<typeof t>[0]),
              }}
              actions={computePtStatus(d) === 'active' && d.sessionsRemaining > 0 ? (
                <div className="mt-2">
                  {/* PT-2: the Calendly moment — free slots only, tap = booked */}
                  <BookPtModal assignmentId={d.id} locale={locale} />
                </div>
              ) : undefined}
            />
          ))
        )}
      </div>
      } aside={
      /* 22R: request from the catalog (type cards) — approval routes through
          sell_pt_package on the staff side. */
      <PtRequestClient
        packages={packages || []}
        coaches={coachOptions}
        locale={locale}
      />
      } />
    </div>
  );
}
