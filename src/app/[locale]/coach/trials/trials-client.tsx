'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fmtDate, fmtTime, fmtPhone } from '@/lib/fmt';
import { Ltr } from '@/components/ui/bdi';
import { StatusChip } from '@/components/ui/status-chip';
import { PageHeader } from '@/components/ui/page-header';
import { CheckCircle2, XCircle, Phone } from 'lucide-react';
import { recordTrialOutcome } from '@/app/[locale]/(dashboard)/leads/actions';
import { useErrorText } from '@/lib/errors/use-error-text';
import { DeskGrid } from '@/components/portal/portal-kit';

export type CoachTrial = {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: 'scheduled' | 'completed' | 'no_show' | 'cancelled';
  show_up: boolean | null;
  feedback: string | null;
};

export function CoachTrialsClient({ trials, locale }: { trials: CoachTrial[]; locale: string }) {
  const t = useTranslations('leads');
  const errText = useErrorText();
  const tc = useTranslations('coachTrials');
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [busyId, setBusyId] = useState<string | null>(null);
  // UX-2: optional Showed inputs — note + "interested?" toggle, captured with
  // the same single tap (filled-or-not when Showed is hit; No-show stays bare).
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [interested, setInterested] = useState<Record<string, boolean>>({});

  const record = async (trialId: string, status: 'completed' | 'no_show', showUp: boolean) => {
    setBusyId(trialId);
    const res = await recordTrialOutcome({
      trialId, status, showUp,
      feedback: showUp ? notes[trialId] : undefined,
      interested: showUp ? (interested[trialId] ?? null) : null,
    });
    setBusyId(null);
    if (res.ok) {
      toast.success(t('toast.outcome_recorded'));
      router.refresh();
    } else {
      toast.error(errText(res.error));
    }
  };

  return (
    <div className="p-4 space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* W2b R3: the ONE title primitive (testid `page-title` — was
          `coach-page-title` with an inline icon; the decoration goes, per the
          primitive's one-title contract). Desktop-only, as before. */}
      <PageHeader title={tc('title')} variant="compact" />

      {trials.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🥋</div>
          <p className="text-gray-500">{tc('empty')}</p>
        </div>
      ) : (
        /* W2a §4.2 Rule 1: main = the trial rows; aside = the pipeline glance
           (status counts over the same rows — §2.4 rule 2). */
        <DeskGrid gap="space-y-3" main={
        <div className="space-y-3">
          {trials.map((tr) => (
            <div
              key={tr.id}
              data-testid="coach-trial-row"
              data-lead-name={tr.lead_name}
              data-trial-status={tr.status}
              className="bg-white rounded-xl border p-4 space-y-2 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{tr.lead_name || tc('unnamed')}</h3>
                {/* DA-34: was the raw ISO dump ("2026-07-19 · 18:00") — via fmt. */}
                <Ltr className="text-xs text-gray-500">
                  {`${fmtDate(tr.scheduled_date, locale, 'weekday')}${tr.scheduled_time ? ` · ${fmtTime(tr.scheduled_time, locale)}` : ''}`}
                </Ltr>
              </div>
              {tr.lead_phone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  <Ltr>{fmtPhone(tr.lead_phone)}</Ltr>
                </div>
              )}

              {tr.status === 'scheduled' ? (
                <div className="space-y-2 pt-1">
                  <input
                    data-testid="coach-trial-note"
                    value={notes[tr.id] ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [tr.id]: e.target.value }))}
                    placeholder={tc('notePlaceholder')}
                    className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    data-testid="coach-trial-interested"
                    data-on={!!interested[tr.id]}
                    onClick={() => setInterested((p) => ({ ...p, [tr.id]: !p[tr.id] }))}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium',
                      interested[tr.id]
                        ? 'border-success-600 bg-success-600 text-success-foreground'
                        : 'border-gray-200 bg-white text-gray-600',
                    )}
                  >
                    {tc('interested')}
                  </button>
                  <div className="flex gap-2">
                  <button
                    data-testid="coach-trial-show"
                    disabled={busyId === tr.id}
                    onClick={() => record(tr.id, 'completed', true)}
                    className="flex-1 py-1.5 text-xs bg-success-600 text-success-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircle2 className="inline h-3.5 w-3.5 me-1" />
                    {t('mark_show')}
                  </button>
                  <button
                    data-testid="coach-trial-noshow"
                    disabled={busyId === tr.id}
                    onClick={() => record(tr.id, 'no_show', false)}
                    className="tint-danger flex-1 py-1.5 text-xs border border-danger-500/30 rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    <XCircle className="inline h-3.5 w-3.5 me-1" />
                    {t('mark_no_show')}
                  </button>
                  </div>
                </div>
              ) : (
                <StatusChip domain="trial" status={tr.status}
                  label={t(`trial_status.${tr.status}` as Parameters<typeof t>[0])} />
              )}
            </div>
          ))}
        </div>
        } aside={
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{tc('title')}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(['scheduled', 'completed', 'no_show'] as const).map((status) => (
              <li key={status} className="flex items-center justify-between gap-2">
                <span className="text-gray-500">{t(`trial_status.${status}` as Parameters<typeof t>[0])}</span>
                <span className="font-semibold text-gray-900">{trials.filter((tr) => tr.status === status).length}</span>
              </li>
            ))}
          </ul>
        </div>
        } />
      )}
    </div>
  );
}
