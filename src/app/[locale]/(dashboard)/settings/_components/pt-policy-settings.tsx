'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dumbbell } from 'lucide-react';
import { updatePtPolicy } from './pt-policy-actions';

type Props = {
  locale: string;
  gymId: string;
  noShowForfeits: boolean;
  lateCancelWindowHours: number;
};

export function PtPolicySettings({ locale, gymId, noShowForfeits, lateCancelWindowHours }: Props) {
  const t = useTranslations('settings');
  const router = useRouter();
  const isRTL = locale === 'ar';
  const [forfeits, setForfeits] = useState(noShowForfeits);
  const [hours, setHours] = useState(String(lateCancelWindowHours));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await updatePtPolicy({ gymId, noShowForfeits: forfeits, lateCancelWindowHours: parseInt(hours || '0', 10) });
    setBusy(false);
    if (res.ok) { toast.success(t('pt_policy_saved')); router.refresh(); }
    else toast.error(res.error || t('pt_policy_error'));
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100" dir={isRTL ? 'rtl' : 'ltr'} data-testid="pt-policy-settings">
      <h2 className={cn('text-lg font-bold text-gray-900 mb-1 flex items-center gap-2', isRTL && 'font-arabic')}>
        <Dumbbell className="h-5 w-5 text-[#cd1419]" />
        {t('pt_policy_title')}
      </h2>
      <p className="text-sm text-gray-500 mb-4">{t('pt_policy_subtitle')}</p>

      <div className="space-y-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-700">{t('pt_no_show_forfeits')}</span>
          <input
            type="checkbox"
            data-testid="pt-noshow-forfeits"
            checked={forfeits}
            onChange={(e) => setForfeits(e.target.checked)}
            className="h-5 w-5 accent-[#cd1419]"
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-700">{t('pt_late_cancel_window')}</span>
          <input
            type="number"
            min={0}
            data-testid="pt-late-cancel-window"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-24 rounded-lg border px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          data-testid="pt-policy-save"
          disabled={busy}
          onClick={save}
          className="rounded-lg bg-[#cd1419] px-4 py-2 text-sm font-medium text-white hover:bg-[#b01216] disabled:opacity-50"
        >
          {t('pt_policy_save')}
        </button>
      </div>
    </div>
  );
}
