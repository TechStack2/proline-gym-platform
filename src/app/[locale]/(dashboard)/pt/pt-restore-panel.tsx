'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';
import { restorePtCredit } from './actions';

type ProfileShape = {
  first_name_ar: string | null; first_name_en: string | null;
  last_name_ar: string | null; last_name_en: string | null;
} | null;

export type PtRestoreAssignment = {
  id: string;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  status: string;
  student: { profile: ProfileShape | ProfileShape[] } | { profile: ProfileShape | ProfileShape[] }[] | null;
};

function studentName(a: PtRestoreAssignment, locale: string): string {
  const st = Array.isArray(a.student) ? a.student[0] : a.student;
  const p = st && (Array.isArray(st.profile) ? st.profile[0] : st.profile);
  if (!p) return '';
  const fn = (p as Record<string, string | null>)[`first_name_${locale}`] || p.first_name_en || '';
  const ln = (p as Record<string, string | null>)[`last_name_${locale}`] || p.last_name_en || '';
  return `${fn} ${ln}`.trim();
}

export function PtRestorePanel({ assignments, locale }: { assignments: PtRestoreAssignment[]; locale: string }) {
  const t = useTranslations('pt');
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [busy, setBusy] = useState<string | null>(null);

  if (assignments.length === 0) return null;

  const restore = async (id: string) => {
    setBusy(id);
    const res = await restorePtCredit({ assignmentId: id, reason: 'staff correction' });
    setBusy(null);
    if (res.ok) { toast.success(t('credit_restored')); router.refresh(); }
    else toast.error(res.error || t('restore_error'));
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100" dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 className={cn('text-sm font-bold text-gray-900 mb-3', isRTL && 'font-arabic')}>{t('restore_panel_title')}</h2>
      <div className="space-y-2">
        {assignments.map((a) => (
          <div
            key={a.id}
            data-testid="pt-restore-row"
            data-assignment-id={a.id}
            data-used={a.sessions_used}
            data-remaining={a.sessions_remaining}
            className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{studentName(a, locale) || '—'}</p>
              <p className="text-xs text-gray-500">
                {t('sessions_remaining', { remaining: a.sessions_remaining, total: a.sessions_total })} · {a.status}
              </p>
            </div>
            <button
              type="button"
              data-testid="pt-restore"
              disabled={busy === a.id}
              onClick={() => restore(a.id)}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-50 shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />{t('restore_credit')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
