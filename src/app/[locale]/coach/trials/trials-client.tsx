'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CalendarClock, CheckCircle2, XCircle, Phone } from 'lucide-react';
import { recordTrialOutcome } from '@/app/[locale]/(dashboard)/leads/actions';

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
  const tc = useTranslations('coachTrials');
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [busyId, setBusyId] = useState<string | null>(null);

  const record = async (trialId: string, status: 'completed' | 'no_show', showUp: boolean) => {
    setBusyId(trialId);
    const res = await recordTrialOutcome({ trialId, status, showUp });
    setBusyId(null);
    if (res.ok) {
      toast.success(t('toast.outcome_recorded'));
      router.refresh();
    } else {
      toast.error(`${t('toast.outcome_error')}: ${res.error}`);
    }
  };

  return (
    <div className="p-4 space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <h1 className={cn('text-xl font-bold text-gray-900 flex items-center gap-2', isRTL && 'font-arabic')}>
        <CalendarClock className="h-5 w-5 text-primary-600" />
        {tc('title')}
      </h1>

      {trials.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🥋</div>
          <p className="text-gray-500">{tc('empty')}</p>
        </div>
      ) : (
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
                <span className="text-xs text-gray-500">
                  {tr.scheduled_date}{tr.scheduled_time ? ` · ${tr.scheduled_time.slice(0, 5)}` : ''}
                </span>
              </div>
              {tr.lead_phone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span dir="ltr">{tr.lead_phone}</span>
                </div>
              )}

              {tr.status === 'scheduled' ? (
                <div className="flex gap-2 pt-1">
                  <button
                    data-testid="coach-trial-show"
                    disabled={busyId === tr.id}
                    onClick={() => record(tr.id, 'completed', true)}
                    className="flex-1 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                    {t('mark_show')}
                  </button>
                  <button
                    data-testid="coach-trial-noshow"
                    disabled={busyId === tr.id}
                    onClick={() => record(tr.id, 'no_show', false)}
                    className="flex-1 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    <XCircle className="inline h-3.5 w-3.5 mr-1" />
                    {t('mark_no_show')}
                  </button>
                </div>
              ) : (
                <span
                  className={cn(
                    'inline-block text-xs px-2 py-0.5 rounded-full font-medium',
                    tr.status === 'completed' ? 'bg-green-100 text-green-700' :
                    tr.status === 'no_show' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {t(`trial_status.${tr.status}` as Parameters<typeof t>[0])}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
