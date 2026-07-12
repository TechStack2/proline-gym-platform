'use client';

import { dateLocale } from '@/lib/utils/locale-format'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ModalPortal } from '@/components/shared/modal-portal';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { WhatsAppShare } from '@/components/shared/whatsapp-share';
import {
  Phone, Mail, Calendar, CalendarClock, Search, Plus, KeyRound, CheckCircle2, XCircle, X, UserCheck,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { FormWizard } from '@/components/shared/form-wizard';
import type {
  Lead, LeadStatus, Discipline, StatusFilter, GymCoach, MembershipPlan, TrialInfo, InviteInfo, LeadSource,
} from './leads-types';
import { LEAD_STATUSES, LEAD_SOURCES, LEADS_LIMIT } from './leads-types';
import { leadStatusUpdateSchema } from '@/lib/validators/leads.schema';
import { addLead, scheduleTrial, recordTrialOutcome, convertLead } from './actions';
import { useErrorText } from '@/lib/errors/use-error-text';

type Props = {
  leads: Lead[];
  total: number; // LEADS-BOUND: total lead count (gym-wide) for the "Showing N of TOTAL" caption
  disciplines: Discipline[];
  coaches: GymCoach[];
  plans: MembershipPlan[];
  trials: TrialInfo[];
  invites: InviteInfo[];
  gymId: string;
  gymName: string; // WL-TEMPLATES: the caller's gym localized name (for the lead-reply wa.me msg)
  locale: string;
  statusColors: Record<string, string>;
  sourceIcons: Record<string, string>;
};

const TRANSLATED_STATUS_MAP = {
  new: 'status.new',
  contacted: 'status.contacted',
  trial_scheduled: 'status.trial_scheduled',
  trial_completed: 'status.trial_completed',
  converted: 'status.converted',
  lost: 'status.lost',
} as const satisfies Record<LeadStatus, string>;

const TIME_SLOTS = ['09:00', '10:00', '11:00', '16:00', '17:00', '18:00', '19:00'];

type ConvertResult = { invoiceNumber: string; totalUsd: number; inviteStatus: string };

export function LeadsClient({
  leads: initialLeads,
  total,
  disciplines,
  coaches,
  plans,
  trials,
  invites,
  gymId,
  gymName,
  locale,
  statusColors,
  sourceIcons,
}: Props) {
  const t = useTranslations('leads');
  const tw = useTranslations('whatsapp');
  const router = useRouter();
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [convertLeadId, setConvertLeadId] = useState<string | null>(null);
  const [convertResult, setConvertResult] = useState<Record<string, ConvertResult>>({});

  const debouncedSearch = useDebounce(search, 300);
  const prevDebouncedSearch = useRef(debouncedSearch);
  const prevStatusFilter = useRef(statusFilter);
  const isInitialMount = useRef(true);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  // FD-1: DERIVED next-action date (leads has no such column — zero schema):
  //   trial_scheduled → the trial's date · new → first contact due (created+2d)
  //   contacted → follow-up due (updated+7d) · trial_completed → decision due
  //   (updated+3d). Overdue = due date in the past → highlighted on the card.
  const nextActionFor = (lead: Lead, trial?: TrialInfo): { label: string; due: Date } | null => {
    const plus = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 864e5);
    switch (lead.status) {
      case 'trial_scheduled':
        return trial ? { label: t('nextAction.trial'), due: new Date(`${trial.scheduled_date}T${trial.scheduled_time || '23:59'}`) } : null;
      case 'new':
        return { label: t('nextAction.firstContact'), due: plus(lead.created_at, 2) };
      case 'contacted':
        return { label: t('nextAction.followUp'), due: plus(lead.updated_at ?? lead.created_at, 7) };
      case 'trial_completed':
        return { label: t('nextAction.decide'), due: plus(lead.updated_at ?? lead.created_at, 3) };
      default:
        return null;
    }
  };

  // Index trials + invites for quick per-lead lookup.
  const trialByLead = useMemo(() => {
    const m = new Map<string, TrialInfo>();
    // `trials` is ordered by scheduled_date DESC → first seen is the latest.
    for (const tr of trials) if (!m.has(tr.lead_id)) m.set(tr.lead_id, tr);
    return m;
  }, [trials]);

  const inviteByStudent = useMemo(() => {
    const m = new Map<string, InviteInfo>();
    for (const inv of invites) m.set(inv.student_id, inv);
    return m;
  }, [invites]);

  // Debounced server-side search with .ilike()
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevDebouncedSearch.current = debouncedSearch;
      prevStatusFilter.current = statusFilter;
      return;
    }
    if (
      debouncedSearch === prevDebouncedSearch.current &&
      statusFilter === prevStatusFilter.current
    ) {
      return;
    }
    prevDebouncedSearch.current = debouncedSearch;
    prevStatusFilter.current = statusFilter;

    async function fetchFiltered() {
      // LEADS-BOUND: same cap as the SSR fetch. .limit() LAST, after the .or()/.eq()
      // filters (chaining .limit() before .or() broke the .ilike() search at runtime).
      let query = supabase
        .from('leads')
        .select('*')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false });
      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
        );
      }
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data } = await query.limit(LEADS_LIMIT);
      if (data) setLeads(data as Lead[]);
    }
    fetchFiltered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter]);

  // ── Status change (optimistic, single .update) ──
  const handleStatusChange = useCallback(
    async (leadId: string, newStatus: LeadStatus) => {
      // GO-LIVE-GUARDS: 'converted' is NOT settable here — conversion happens ONLY
      // via the ConvertModal/convertLead path (creates the member + invoice). The
      // select no longer offers it; this guards any other caller.
      if (newStatus === 'converted') {
        toast.error(t('toast.status_error'));
        return;
      }
      const statusPayload = {
        id: leadId,
        status: newStatus,
        // converted_at is stamped ONLY by the convertLead path (the guard above
        // makes 'converted' unreachable here).
        converted_at: undefined,
      };
      const parsed = leadStatusUpdateSchema.safeParse(statusPayload);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message || t('toast.status_error'));
        return;
      }
      const previousLeads = [...leads];
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)),
      );
      try {
        const { error } = await supabase
          .from('leads')
          .update({ status: newStatus })
          .eq('id', leadId);
        if (error) throw error;
        toast.success(t('toast.status_updated'));
      } catch {
        setLeads(previousLeads);
        toast.error(t('toast.status_error'));
      }
    },
    [leads, supabase, t],
  );

  // ── T2 — assign the lead to the current staffer (persist assigned_to) ──
  const handleAssignToMe = useCallback(
    async (leadId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: user.id })
        .eq('id', leadId);
      if (error) {
        toast.error(t('toast.assign_error'));
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, assigned_to: user.id } : l)),
      );
      toast.success(t('toast.assigned'));
    },
    [supabase, t],
  );

  const statusDisplay = (s: LeadStatus): string =>
    t(TRANSLATED_STATUS_MAP[s] as Parameters<typeof t>[0]);

  const localizedName = (
    o: { name_ar: string; name_en: string; name_fr: string } | { first_name_ar: string; first_name_en: string; first_name_fr: string },
    base: 'name' | 'first_name',
  ): string => {
    const rec = o as Record<string, string>;
    if (isRTL) return rec[`${base}_ar`];
    if (locale === 'fr') return rec[`${base}_fr`];
    return rec[`${base}_en`];
  };

  const planLabel = (p: MembershipPlan) =>
    `${localizedName(p, 'name')} — $${Number(p.price_usd).toFixed(2)} / ${p.duration_days}${t('plan_days')}`;

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filter + Add Lead */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400',
              isRTL ? 'right-3' : 'left-3',
            )}
          />
          <input
            type="text"
            className={cn(
              'w-full py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500',
              isRTL ? 'pr-9 pl-4 text-right' : 'pl-9 pr-4',
            )}
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">{t('all_statuses')}</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusDisplay(s)}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="add-lead-button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 text-primary-foreground rounded-lg hover:bg-primary-700 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          {t('add_lead')}
        </button>
      </div>

      {/* LEADS-BOUND: the list is capped at LEADS_LIMIT — surface the gym-wide total so
          staff know more exist (a real load-more is a later polish). */}
      {total > 0 && (
        <p className="text-xs text-gray-500" data-testid="leads-showing-count">
          {t('showing', { shown: leads.length, total })}
        </p>
      )}

      {/* Lead Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leads.map((lead) => {
          const disc = disciplines.find((d) => d.id === lead.interested_discipline_id);
          const isExpanded = expandedLead === lead.id;
          const trial = trialByLead.get(lead.id);
          const invite = lead.converted_student_id
            ? inviteByStudent.get(lead.converted_student_id)
            : undefined;
          const result = convertResult[lead.id];
          // GRW-1: a FRESH inquiry — captured-status 'new' within 48h (the
          // landing form's just-arrived leads). Highlighted so the desk acts fast.
          const isFresh = lead.status === 'new'
            && (Date.now() - new Date(lead.created_at).getTime()) < 48 * 3600e3;

          return (
            <Card
              key={lead.id}
              data-testid="lead-card"
              data-lead-name={`${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()}
              data-lead-status={lead.status}
              data-fresh={isFresh}
              className={cn('hover:shadow-md transition-shadow', isFresh && 'ring-2 ring-primary-700/40')}
            >
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 flex items-center gap-1.5">
                      {lead.first_name} {lead.last_name}
                      {isFresh && (
                        <span data-testid="lead-fresh-badge" className="rounded-full bg-primary-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                          {t('freshInquiry')}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs">{sourceIcons[lead.source] || '📋'}</span>
                      <span
                        data-testid="lead-source"
                        className="text-xs text-gray-400 capitalize"
                      >
                        {t(`source.${lead.source}` as Parameters<typeof t>[0])}
                      </span>
                    </div>
                  </div>
                  {/* GO-LIVE-GUARDS: converted is a TERMINAL, machine-set state — the
                      ConvertModal/convertLead path (member + invoice) is the only way
                      in. A converted lead shows a non-interactive badge; the select
                      never offers 'converted' (no phantom-convert without a member). */}
                  {lead.status === 'converted' ? (
                    <span
                      data-testid="lead-converted-badge"
                      className={cn('text-xs px-2 py-1 rounded-full border font-medium', statusColors.converted || 'bg-gray-100')}
                    >
                      {statusDisplay('converted')}
                    </span>
                  ) : (
                    <select
                      className={cn(
                        'text-xs px-2 py-1 rounded-full border font-medium',
                        statusColors[lead.status] || 'bg-gray-100',
                      )}
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                    >
                      {LEAD_STATUSES.filter((s) => s !== 'converted').map((s) => (
                        <option key={s} value={s}>
                          {statusDisplay(s)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {(() => {
                  const na = nextActionFor(lead, trial);
                  if (!na) return null;
                  const overdue = na.due.getTime() < Date.now();
                  return (
                    <p
                      data-testid="lead-next-action"
                      data-overdue={overdue}
                      className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium',
                        overdue ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500')}
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      {na.label} · {na.due.toLocaleDateString(dateLocale(locale))}
                      {overdue && <span className="font-bold uppercase">· {t('nextAction.overdue')}</span>}
                    </p>
                  );
                })()}

                <div className="space-y-1 text-sm">
                  {lead.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`tel:${lead.phone}`} className="hover:text-primary-600">
                        {lead.phone}
                      </a>
                      <WhatsAppShare phone={lead.phone} testid="lead-wa"
                        message={tw('tmpl.leadReply', { name: `${lead.first_name ?? ''}`.trim() || t('guardian_default'), gym: gymName })}
                        label={tw('share.reply')} />
                    </div>
                  )}
                  {lead.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`mailto:${lead.email}`} className="hover:text-primary-600 text-xs">
                        {lead.email}
                      </a>
                    </div>
                  )}
                  {disc && <p className="text-gray-500">{localizedName(disc, 'name')}</p>}
                  {/* MJ-5: the landing "request to join" product interests as chips. */}
                  {lead.interest_categories && lead.interest_categories.length > 0 && (
                    <div data-testid="lead-interests" className="flex flex-wrap gap-1">
                      {lead.interest_categories.map((k) => (
                        <span key={k} data-testid="lead-interest-chip" data-value={k}
                          className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                          {t(`interest.${k}` as Parameters<typeof t>[0])}
                        </span>
                      ))}
                    </div>
                  )}
                  {trial && (
                    <p className="text-xs text-purple-600 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {t('trial_on')} {trial.scheduled_date}
                      {trial.scheduled_time ? ` · ${trial.scheduled_time.slice(0, 5)}` : ''}
                      {trial.status !== 'scheduled' ? ` · ${t(`trial_status.${trial.status}` as Parameters<typeof t>[0])}` : ''}
                    </p>
                  )}
                </div>

                {lead.notes && (
                  <p className="text-xs text-gray-400 italic bg-gray-50 p-2 rounded">{lead.notes}</p>
                )}

                {/* Converted: show simulated invite state (T5 provisioning seam) */}
                {lead.status === 'converted' && (invite || result) && (
                  <div
                    data-testid="invite-badge"
                    className="text-xs flex items-center gap-1.5 bg-green-50 text-green-700 p-2 rounded"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {t('invite_simulated')}
                    {result && (
                      <span data-testid="convert-result" className="text-green-800">
                        · {result.invoiceNumber} · ${result.totalUsd.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                {lead.status !== 'converted' && lead.status !== 'lost' && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <button
                      onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                      className="flex-1 h-8 text-xs border rounded-lg hover:bg-gray-50 font-medium"
                    >
                      <Calendar className="inline h-3 w-3 me-1" />
                      {t('schedule_trial')}
                    </button>
                    <button
                      data-testid="convert-open"
                      onClick={() => setConvertLeadId(lead.id)}
                      className="flex-1 h-8 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium"
                    >
                      {t('convert')}
                    </button>
                    <button
                      onClick={() => handleAssignToMe(lead.id)}
                      title={t('assign_to_me')}
                      className="h-8 px-2 text-xs border rounded-lg hover:bg-gray-50"
                    >
                      <UserCheck className="inline h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Trial scheduling + outcome (T3/T4) */}
                {isExpanded && lead.status !== 'converted' && lead.status !== 'lost' && (
                  <TrialPanel
                    lead={lead}
                    coaches={coaches}
                    trial={trial}
                    locale={locale}
                    isRTL={isRTL}
                    onDone={() => {
                      setExpandedLead(null);
                      router.refresh();
                    }}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {leads.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500">{t('no_leads_found')}</p>
        </div>
      )}

      {addOpen && (
        <AddLeadModal
          disciplines={disciplines}
          locale={locale}
          isRTL={isRTL}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}

      {convertLeadId && (
        <ConvertModal
          gymId={gymId}
          lead={leads.find((l) => l.id === convertLeadId)!}
          plans={plans}
          locale={locale}
          isRTL={isRTL}
          planLabel={planLabel}
          onClose={() => setConvertLeadId(null)}
          onConverted={(res) => {
            setConvertResult((prev) => ({ ...prev, [convertLeadId]: res }));
            setConvertLeadId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial scheduling + outcome panel (T3/T4)
// ─────────────────────────────────────────────────────────────────────────────
function TrialPanel({
  lead, coaches, trial, isRTL, onDone,
}: {
  lead: Lead;
  coaches: GymCoach[];
  trial?: TrialInfo;
  locale: string;
  isRTL: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('leads');
  const errText = useErrorText();
  const [date, setDate] = useState('');
  const [time, setTime] = useState(TIME_SLOTS[0]);
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const coachName = (c: GymCoach) =>
    isRTL ? c.first_name_ar : c.first_name_en;

  const handleSchedule = async () => {
    if (!date) {
      toast.error(t('toast.trial_date_required'));
      return;
    }
    setBusy(true);
    const res = await scheduleTrial({
      leadId: lead.id,
      scheduledDate: date,
      scheduledTime: time,
      coachId,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(t('toast.trial_scheduled'));
      onDone();
    } else {
      toast.error(errText(res.error));
    }
  };

  const handleOutcome = async (status: 'completed' | 'no_show', showUp: boolean) => {
    if (!trial) return;
    setBusy(true);
    const res = await recordTrialOutcome({ trialId: trial.id, status, showUp });
    setBusy(false);
    if (res.ok) {
      toast.success(t('toast.outcome_recorded'));
      onDone();
    } else {
      toast.error(errText(res.error));
    }
  };

  return (
    <div className="pt-2 border-t space-y-2">
      {/* Record outcome if a trial is already scheduled */}
      {trial && trial.status === 'scheduled' ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">{t('record_outcome')}</p>
          <div className="flex gap-2">
            <button
              data-testid="trial-show"
              disabled={busy}
              onClick={() => handleOutcome('completed', true)}
              className="flex-1 py-1.5 text-xs bg-green-600 text-primary-foreground rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="inline h-3.5 w-3.5 me-1" />
              {t('mark_show')}
            </button>
            <button
              data-testid="trial-noshow"
              disabled={busy}
              onClick={() => handleOutcome('no_show', false)}
              className="flex-1 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
            >
              <XCircle className="inline h-3.5 w-3.5 me-1" />
              {t('mark_no_show')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">{t('schedule_trial_session')}</p>
          <div className="flex gap-2">
            <input
              type="date"
              data-testid="trial-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border rounded"
            />
            <select
              data-testid="trial-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="px-2 py-1 text-xs border rounded"
            >
              {TIME_SLOTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <select
            data-testid="trial-coach"
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            className="w-full px-2 py-1 text-xs border rounded"
          >
            <option value="">{t('select_coach')}</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{coachName(c)}</option>
            ))}
          </select>
          <button
            data-testid="trial-confirm"
            disabled={busy}
            onClick={handleSchedule}
            className="w-full py-1.5 text-xs bg-primary-600 text-primary-foreground rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {t('confirm_trial')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Lead modal (T1b — staff-manual origination)
// ─────────────────────────────────────────────────────────────────────────────
function AddLeadModal({
  disciplines, locale, isRTL, onClose, onCreated,
}: {
  disciplines: Discipline[];
  locale: string;
  isRTL: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('leads');
  const errText = useErrorText();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<LeadSource>('walk_in');
  const [sourceDetail, setSourceDetail] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const disciplineName = (d: Discipline) => (isRTL ? d.name_ar : d.name_en);

  const handleSubmit = async () => {
    setBusy(true);
    const res = await addLead({
      first_name: firstName, last_name: lastName, phone, email,
      source, source_detail: sourceDetail, discipline_id: disciplineId, notes,
    });
    setBusy(false);
    if (res.ok) { toast.success(t('toast.lead_added')); onCreated(); }
    else toast.error(errText(res.error));
  };

  // UX-2: the prototype modal became the FormWizard (contact → interest+source
  // chips → review with the DERIVED next action — 23R write path unchanged).
  const firstContactDue = new Date(Date.now() + 2 * 864e5)
    .toLocaleDateString(dateLocale(locale));

  const steps = [
    {
      key: 'contact',
      title: t('wizard.contact'),
      valid: firstName.trim() !== '' && lastName.trim() !== '' && phone.trim() !== '',
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('field.first_name')}>
              <input data-testid="lead-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 w-full rounded-md border px-3 text-sm" />
            </Field>
            <Field label={t('field.last_name')}>
              <input data-testid="lead-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9 w-full rounded-md border px-3 text-sm" />
            </Field>
          </div>
          <Field label={t('field.phone')}>
            <input data-testid="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="h-9 w-full rounded-md border px-3 text-sm" />
          </Field>
          <Field label={t('field.email')}>
            <input data-testid="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="h-9 w-full rounded-md border px-3 text-sm" />
          </Field>
        </div>
      ),
    },
    {
      key: 'interest',
      title: t('wizard.interest'),
      content: (
        <div className="space-y-3">
          <Field label={t('field.discipline')}>
            <div className="flex flex-wrap gap-1.5">
              {disciplines.map((d) => (
                <button key={d.id} type="button" data-testid="lead-discipline-chip" data-id={d.id}
                  onClick={() => setDisciplineId(disciplineId === d.id ? '' : d.id)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                    disciplineId === d.id ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700')}>
                  {disciplineName(d)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('field.source')}>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_SOURCES.map((src) => (
                <button key={src} type="button" data-testid="lead-source-chip" data-value={src}
                  onClick={() => setSource(src)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium',
                    source === src ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700')}>
                  {t(`source.${src}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('field.source_detail')}>
            <input data-testid="lead-source-detail" value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} className="h-9 w-full rounded-md border px-3 text-sm" />
          </Field>
          <Field label={t('field.notes')}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="h-9 w-full rounded-md border px-3 text-sm" />
          </Field>
        </div>
      ),
    },
    {
      key: 'review',
      title: t('wizard.review'),
      content: (
        <div className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700" data-testid="lead-review">
          <p className="font-semibold text-gray-900">{firstName} {lastName}</p>
          <p dir="ltr">{phone}{email ? ` · ${email}` : ''}</p>
          <p>{t(`source.${source}` as Parameters<typeof t>[0])}{disciplineId ? ` · ${disciplineName(disciplines.find((d) => d.id === disciplineId)!)}` : ''}</p>
          <p className="text-xs text-amber-700">{t('wizard.nextAction', { date: firstContactDue })}</p>
        </div>
      ),
    },
  ];

  return (
    <FormWizard
      open
      onClose={onClose}
      title={t('add_lead')}
      steps={steps}
      onSubmit={handleSubmit}
      submitLabel={t('add_lead')}
      busy={busy}
      locale={locale}
      testid="add-lead-modal"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert modal (T5 — plan picker + soft duplicate-phone warning)
// ─────────────────────────────────────────────────────────────────────────────
function ConvertModal({
  lead, plans, locale, isRTL, planLabel, onClose, onConverted, gymId,
}: {
  lead: Lead;
  plans: MembershipPlan[];
  locale: string;
  isRTL: boolean;
  planLabel: (p: MembershipPlan) => string;
  onClose: () => void;
  onConverted: (res: ConvertResult) => void;
  gymId: string;
}) {
  const t = useTranslations('leads');
  const errText = useErrorText();
  const supabase = createClient();
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [dupWarning, setDupWarning] = useState(false);
  // B3 origination C: optionally attach/create a guardian for a minor at
  // conversion (search-by-phone first; create only if new). Best-effort —
  // conversion itself is already committed when this runs.
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');

  const linkGuardianAfterConvert = async (studentId: string) => {
    const phone = guardianPhone.trim();
    if (!phone) return;
    try {
      const { data: prof } = await supabase
        .from('profiles').select('id').eq('gym_id', gymId).eq('phone', phone).limit(1).maybeSingle();
      let profileId = prof?.id as string | undefined;
      if (!profileId) {
        const nm = guardianName.trim() || t('guardian_default');
        const { data: created, error: pErr } = await supabase
          .from('profiles')
          .insert({ gym_id: gymId, phone, first_name_en: nm, first_name_ar: nm, first_name_fr: nm, last_name_en: '', last_name_ar: '', last_name_fr: '' })
          .select('id').single();
        if (pErr) throw pErr;
        profileId = created.id;
      }
      let { data: g } = await supabase.from('guardians').select('id').eq('profile_id', profileId!).maybeSingle();
      if (!g) {
        const { data: gNew, error: gErr } = await supabase
          .from('guardians').insert({ profile_id: profileId!, gym_id: gymId, is_primary_contact: true }).select('id').single();
        if (gErr) throw gErr;
        g = gNew;
      }
      await supabase.from('guardian_students').insert({ guardian_id: g!.id, student_id: studentId });
      toast.success(t('toast.guardian_linked'));
    } catch (e: any) {
      toast.error(`${t('toast.guardian_link_failed')}`);
    }
  };

  // Soft duplicate-phone warning (no hard block).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!lead.phone) return;
      const { data } = await supabase.rpc('member_phone_exists', { p_phone: lead.phone });
      if (active && data === true) setDupWarning(true);
    })();
    return () => { active = false; };
  }, [lead.phone, supabase]);

  const handleConvert = async () => {
    if (!planId) {
      toast.error(t('toast.plan_required'));
      return;
    }
    setBusy(true);
    const res = await convertLead({ leadId: lead.id, planId });
    setBusy(false);
    if (res.ok) {
      toast.success(t('toast.converted'));
      await linkGuardianAfterConvert(res.studentId);
      onConverted({
        invoiceNumber: res.invoiceNumber,
        totalUsd: res.totalUsd,
        inviteStatus: res.inviteStatus,
      });
    } else {
      toast.error(errText(res.error));
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        data-testid="convert-modal"
        dir={isRTL ? 'rtl' : 'ltr'}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className={cn('text-lg font-bold', isRTL && 'font-arabic')}>
            {t('convert_title')}
          </h2>
          <button onClick={onClose} aria-label="close"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <p className="text-sm text-gray-500">
          {t('convert_subtitle', { name: `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() })}
        </p>

        {/* MJ-5: the lead's name + normalized phone carry straight into the member —
            no retyping. Or set them up as a family (guardian + kids), pre-filled. */}
        <div data-testid="convert-prefill" className="rounded-xl border bg-gray-50 p-3">
          <p className="text-sm text-gray-800">
            <span className="font-medium">{`${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()}</span>
            {lead.phone ? <span dir="ltr"> · {lead.phone}</span> : null}
          </p>
          <a
            data-testid="convert-as-family"
            href={`/${locale}/students/add?prefillName=${encodeURIComponent(`${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim())}&prefillPhone=${encodeURIComponent(lead.phone ?? '')}&mode=family`}
            className="mt-1 inline-block text-xs font-medium text-primary-700 hover:underline"
          >
            {t('convert_as_family')}
          </a>
        </div>

        {dupWarning && (
          <div data-testid="dup-phone-warning" className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg p-2">
            ⚠️ {t('dup_phone_warning')}
          </div>
        )}

        {/* B3: optional guardian for minors (search-by-phone first; created if new) */}
        <div className="space-y-1.5 rounded-xl border bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-600">{t('guardian_optional')}</p>
          <input
            data-testid="convert-guardian-phone"
            dir="ltr"
            placeholder="+961…"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            className="h-9 w-full rounded-md border px-3 text-sm"
          />
          <input
            data-testid="convert-guardian-name"
            placeholder={t('guardian_name_placeholder')}
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            className="h-9 w-full rounded-md border px-3 text-sm"
          />
        </div>

        <Field label={t('select_plan')}>
          <select
            data-testid="convert-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {plans.length === 0 && <option value="">{t('no_plans')}</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{planLabel(p)}</option>
            ))}
          </select>
        </Field>

        <p className="text-xs text-gray-400">{t('convert_note')}</p>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50">
            {t('cancel')}
          </button>
          <button
            data-testid="convert-confirm"
            disabled={busy || !planId}
            onClick={handleConvert}
            className="flex-1 py-2 text-sm bg-green-600 text-primary-foreground rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {t('convert_confirm')}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
