'use client';

import { dateLocale } from '@/lib/utils/locale-format'
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dumbbell, PlayCircle, CalendarPlus, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { useErrorText } from '@/lib/errors/use-error-text';
import {
  schedulePtSession, logPtDelivery, completePtSession, cancelOrNoShowPtSession,
  checkPtScheduleConflicts, type PtConflict,
} from './actions';

type RosterRow = {
  assignment_id: string;
  student_name: string;
  package_name_ar: string;
  package_name_en: string;
  package_name_fr: string;
  sessions_total: number;
  sessions_remaining: number;
};

type SessionRow = {
  session_id: string;
  assignment_id: string | null;
  student_name: string;
  package_name_ar: string;
  package_name_en: string;
  package_name_fr: string;
  scheduled_at: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  sessions_total: number | null;
  sessions_remaining: number | null;
};

type Props = { roster: RosterRow[]; sessions: SessionRow[]; locale: string };

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
};

// FORM-FOCUS-SWEEP: hoisted to module scope (stable type) — was defined during render.
const SessionItem = ({ s, busy, run, t, locale }: {
  s: SessionRow;
  busy: string | null;
  run: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => Promise<void>;
  t: ReturnType<typeof useTranslations<'pt'>>;
  locale: string;
}) => (
  <div data-testid="pt-session-row" data-session-id={s.session_id} data-assignment-id={s.assignment_id ?? ''} data-status={s.status} data-remaining={s.sessions_remaining ?? ''} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-xs text-gray-600">
        {new Date(s.scheduled_at).toLocaleDateString(dateLocale(locale))}
        {s.sessions_remaining != null ? ` · ${t('sessions_remaining', { remaining: s.sessions_remaining, total: s.sessions_total ?? 0 })}` : ''}
      </p>
      <span className={cn('shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[s.status])}>
        {t(`session_status.${s.status}` as Parameters<typeof t>[0])}
      </span>
    </div>
    {(s.status === 'scheduled' || s.status === 'completed') && (
      <div className="flex gap-1.5">
        <button
          type="button"
          data-testid="pt-complete"
          disabled={busy !== null}
          onClick={() => run(`cmp-${s.session_id}`, () => completePtSession({ sessionId: s.session_id }), t('session_completed'))}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {s.status === 'completed' ? t('session_status.completed') : t('complete')}
        </button>
        {s.status === 'scheduled' && (
          <>
            <button
              type="button"
              data-testid="pt-noshow"
              disabled={busy !== null}
              onClick={() => run(`ns-${s.session_id}`, () => cancelOrNoShowPtSession({ sessionId: s.session_id, outcome: 'no_show' }), t('session_no_show'))}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-red-50 text-red-700 border border-red-200 px-2 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />{t('no_show')}
            </button>
            <button
              type="button"
              data-testid="pt-cancel"
              disabled={busy !== null}
              onClick={() => run(`cn-${s.session_id}`, () => cancelOrNoShowPtSession({ sessionId: s.session_id, outcome: 'cancelled' }), t('session_cancelled'))}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" />{t('cancel')}
            </button>
          </>
        )}
      </div>
    )}
  </div>
);

export function CoachPtRosterClient({ roster, sessions, locale }: Props) {
  const t = useTranslations('pt');
  const errText = useErrorText();
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [busy, setBusy] = useState<string | null>(null);
  // IA-3 read-side conflict guard: warnings per assignment (non-blocking — the
  // booking below proceeds regardless; C1's RPC stays the only write authority).
  const [conflicts, setConflicts] = useState<Record<string, { coachName: string; items: PtConflict[] }>>({});

  const scheduleWithGuard = async (assignmentId: string) => {
    try {
      const check = await checkPtScheduleConflicts({ assignmentId });
      if (check.ok && check.conflicts.length > 0) {
        setConflicts((prev) => ({ ...prev, [assignmentId]: { coachName: check.coachName, items: check.conflicts } }));
      } else if (check.ok) {
        setConflicts((prev) => {
          const next = { ...prev };
          delete next[assignmentId];
          return next;
        });
      }
    } catch {
      // best-effort warning — never blocks scheduling
    }
    return schedulePtSession({ assignmentId });
  };

  const pkg = (r: { package_name_ar: string; package_name_en: string; package_name_fr: string }) =>
    locale === 'ar' ? r.package_name_ar || r.package_name_en
      : locale === 'fr' ? r.package_name_fr || r.package_name_en
        : r.package_name_en;

  // PT-1 §3.1: sessions NEST under their package/assignment row — the flat
  // sibling list below the roster is gone. Unlinked legacy rows group last.
  const sessionsByAssignment = new Map<string, SessionRow[]>();
  const unlinkedSessions: SessionRow[] = [];
  for (const sRow of sessions) {
    if (!sRow.assignment_id) { unlinkedSessions.push(sRow); continue; }
    const list = sessionsByAssignment.get(sRow.assignment_id) ?? [];
    list.push(sRow);
    sessionsByAssignment.set(sRow.assignment_id, list);
  }
  // Sessions whose assignment is no longer on the active roster (completed/
  // expired packages) still render — grouped under a trailing block so the
  // coach keeps their full history without a flat wall.
  const rosterIds = new Set(roster.map((r) => r.assignment_id));
  const offRoster = [...sessionsByAssignment.entries()].filter(([id]) => !rosterIds.has(id));

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) { toast.success(okMsg); router.refresh(); }
    else toast.error(errText(res.error));
  };

  return (
    <div className={cn('p-4 space-y-5', isRTL && 'rtl')}>
      <div>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>{t('my_pt_students')}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('my_pt_students_subtitle')}</p>
      </div>

      {/* Active assignments — schedule or log-on-delivery */}
      {roster.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Dumbbell className="mx-auto h-10 w-10 mb-3" />
          <p className="font-medium">{t('no_pt_students')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roster.map((r) => (
            <div key={r.assignment_id} data-testid="pt-roster-row" data-assignment-id={r.assignment_id} data-package-en={r.package_name_en} data-remaining={r.sessions_remaining} className="rounded-xl bg-white p-3 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold text-gray-900 truncate', isRTL && 'font-arabic')}>{r.student_name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {pkg(r)} · {t('sessions_remaining', { remaining: r.sessions_remaining, total: r.sessions_total })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="pt-schedule"
                  disabled={busy !== null || r.sessions_remaining <= 0}
                  onClick={() => run(`sch-${r.assignment_id}`, () => scheduleWithGuard(r.assignment_id), t('session_scheduled'))}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-40"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />{t('schedule')}
                </button>
                <button
                  type="button"
                  data-testid="pt-log"
                  disabled={busy !== null || r.sessions_remaining <= 0}
                  onClick={() => run(`log-${r.assignment_id}`, () => logPtDelivery({ assignmentId: r.assignment_id }), t('log_session_success'))}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#cd1419]/30 px-2.5 py-1.5 text-xs font-medium text-[#cd1419] disabled:opacity-40"
                >
                  <PlayCircle className="h-3.5 w-3.5" />{t('log_session')}
                </button>
              </div>
              </div>
              {conflicts[r.assignment_id] && conflicts[r.assignment_id].items.length > 0 && (
                <div data-testid="pt-conflict-warning" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  {t('conflict_warning', {
                    coach: conflicts[r.assignment_id].coachName,
                    event: conflicts[r.assignment_id].items[0].kind === 'class'
                      ? conflicts[r.assignment_id].items[0].label
                      : t('conflict_pt_event'),
                    time: conflicts[r.assignment_id].items[0].time,
                  })}
                </div>
              )}
              {(sessionsByAssignment.get(r.assignment_id) ?? []).length > 0 && (
                <div className="mt-2 space-y-1.5 border-t pt-2">
                  {(sessionsByAssignment.get(r.assignment_id) ?? []).map((sRow) => (
                    <SessionItem key={sRow.session_id} s={sRow} busy={busy} run={run} t={t} locale={locale} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Off-roster packages (completed/expired) — sessions stay grouped per
          assignment; unlinked legacy rows surface once at the end. */}
      {(offRoster.length > 0 || unlinkedSessions.length > 0) && (
        <div>
          <h3 className={cn('text-sm font-bold text-gray-900 mb-2', isRTL && 'font-arabic')}>{t('sessions')}</h3>
          <div className="space-y-3">
            {offRoster.map(([aid, list]) => (
              <div key={aid} className="rounded-xl bg-white p-3 shadow-sm border border-gray-100">
                <p className={cn('mb-1.5 text-sm font-semibold text-gray-900 truncate', isRTL && 'font-arabic')}>
                  {list[0].student_name} <span className="text-xs font-normal text-gray-500">· {pkg(list[0])}</span>
                </p>
                <div className="space-y-1.5">
                  {list.map((sRow) => <SessionItem key={sRow.session_id} s={sRow} busy={busy} run={run} t={t} locale={locale} />)}
                </div>
              </div>
            ))}
            {unlinkedSessions.length > 0 && (
              <div className="rounded-xl bg-amber-50/60 p-3 border border-amber-100" data-testid="pt-coach-unlinked">
                <p className="mb-1.5 text-xs font-medium text-amber-700">{t('unlinked_sessions')}</p>
                <div className="space-y-1.5">
                  {unlinkedSessions.map((sRow) => <SessionItem key={sRow.session_id} s={sRow} busy={busy} run={run} t={t} locale={locale} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
