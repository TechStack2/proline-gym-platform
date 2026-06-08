'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Dumbbell, PlayCircle } from 'lucide-react';

type RosterRow = {
  assignment_id: string;
  student_name: string;
  package_name_ar: string;
  package_name_en: string;
  package_name_fr: string;
  sessions_total: number;
  sessions_remaining: number;
};

type Props = { roster: RosterRow[]; locale: string };

export function CoachPtRosterClient({ roster: initial, locale }: Props) {
  const t = useTranslations('pt');
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const [roster, setRoster] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);

  const pkgName = (r: RosterRow) => {
    if (locale === 'ar') return r.package_name_ar || r.package_name_en;
    if (locale === 'fr') return r.package_name_fr || r.package_name_en;
    return r.package_name_en;
  };

  const handleLogSession = async (r: RosterRow) => {
    if (r.sessions_remaining <= 0) return;
    setProcessing(r.assignment_id);
    setRoster((prev) =>
      prev.map((x) => (x.assignment_id === r.assignment_id ? { ...x, sessions_remaining: x.sessions_remaining - 1 } : x)),
    );
    try {
      const { error } = await supabase.rpc('increment_sessions_used', { assignment_id: r.assignment_id });
      if (error) throw error;
      toast.success(t('log_session_success'));
    } catch (err: unknown) {
      setRoster((prev) =>
        prev.map((x) => (x.assignment_id === r.assignment_id ? { ...x, sessions_remaining: x.sessions_remaining + 1 } : x)),
      );
      toast.error(err instanceof Error ? err.message : t('log_session_error'));
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className={cn('p-4 space-y-4', isRTL && 'rtl')}>
      <div>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>
          {t('my_pt_students')}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('my_pt_students_subtitle')}</p>
      </div>

      {roster.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center text-gray-400">
          <Dumbbell className="mx-auto h-10 w-10 mb-3" />
          <p className="font-medium">{t('no_pt_students')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roster.map((r) => (
            <div key={r.assignment_id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm border border-gray-100">
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold text-gray-900 truncate', isRTL && 'font-arabic')}>
                  {r.student_name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {pkgName(r)} · {t('sessions_remaining', { remaining: r.sessions_remaining, total: r.sessions_total })}
                </p>
              </div>
              <button
                type="button"
                disabled={processing === r.assignment_id || r.sessions_remaining <= 0}
                onClick={() => handleLogSession(r)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#cd1419]/30 px-3 py-1.5 text-xs font-medium text-[#cd1419] disabled:opacity-40"
              >
                <PlayCircle className="h-4 w-4" />
                {t('log_session')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
