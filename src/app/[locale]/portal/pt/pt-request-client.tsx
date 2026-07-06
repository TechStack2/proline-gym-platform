'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { getLocalizedName } from '@/lib/i18n/helpers';
import { Dumbbell, Clock, Send } from 'lucide-react';

type PackageRow = {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  session_count: number;
  price_usd: number;
  price_lbp?: number | null;
  validity_days: number | null;
};

type CoachOption = { id: string; name: string };

type Props = {
  packages: PackageRow[];
  coaches: CoachOption[];
  locale: string;
};

export function PtRequestClient({ packages, coaches, locale }: Props) {
  const t = useTranslations('pt');
  const router = useRouter();
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [coachId, setCoachId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async (pkgId: string) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('request_pt', {
        p_package_id: pkgId,
        ...(coachId ? { p_coach_id: coachId } : {}),
      });
      if (error) throw error;
      toast.success(t('request_success'));
      setSelectedPkg(null);
      setCoachId('');
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('request_error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn('space-y-6', isRTL && 'rtl')}>
      {/* Available packages */}
      <section className="space-y-2">
        <h2 className={cn('text-sm font-semibold text-gray-700', isRTL && 'font-arabic')}>
          {t('available_packages')}
        </h2>

        {packages.length === 0 && (
          <p className="text-sm text-gray-400">{t('no_packages_found')}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {packages.map((pkg) => (
            <div key={pkg.id} data-testid="pt-package-card" data-package-name={pkg.name_en} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-[#cd1419]/10 flex items-center justify-center">
                    <Dumbbell className="h-4 w-4 text-[#cd1419]" />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
                      {getLocalizedName(pkg, locale)}
                    </p>
                    <p className="text-xs text-gray-400">{pkg.session_count} {t('sessions')}</p>
                  </div>
                </div>
                <div className="text-end">
                  <span className="text-lg font-bold text-[#cd1419]">${pkg.price_usd}</span>
                </div>
              </div>

              {pkg.validity_days != null && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{pkg.validity_days} {t('validity')}</span>
                </div>
              )}

              {selectedPkg === pkg.id ? (
                <div className="space-y-2 pt-2 border-t">
                  <select
                    className="w-full px-3 py-2 text-sm border rounded-lg"
                    value={coachId}
                    onChange={(e) => setCoachId(e.target.value)}
                  >
                    <option value="">{t('preferred_coach_optional')}</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      disabled={submitting}
                      onClick={() => handleRequest(pkg.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#cd1419] px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {t('send_request')}
                    </button>
                    <button
                      onClick={() => { setSelectedPkg(null); setCoachId(''); }}
                      className="rounded-lg border px-3 py-2 text-sm text-gray-600"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedPkg(pkg.id)}
                  className="w-full rounded-lg border border-[#cd1419]/30 px-3 py-2 text-sm font-medium text-[#cd1419]"
                >
                  {t('request_this_package')}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
