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

  // Chip styling — selected chip gets the primary fill (the no-dropdown convention).
  const chipCls = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-primary-700 bg-primary-700 text-primary-foreground'
        : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300',
    );

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
    <div className="space-y-6">
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
                  <div className="h-9 w-9 rounded-xl bg-primary-700/10 flex items-center justify-center">
                    <Dumbbell className="h-4 w-4 text-primary-700" />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
                      {getLocalizedName(pkg, locale)}
                    </p>
                    <p className="text-xs text-gray-400">{pkg.session_count} {t('sessions')}</p>
                  </div>
                </div>
                <div className="text-end">
                  <span className="text-lg font-bold text-primary-700">${pkg.price_usd}</span>
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
                  {/* PT PICKER: guided coach chips (no dropdown) — the J3/M2-D idiom.
                      "No preference" is the default; picking a coach is optional. */}
                  <p className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>{t('preferred_coach_optional')}</p>
                  <div className="flex flex-wrap gap-1.5" data-testid="pt-request-coach-picker">
                    <button type="button" data-testid="pt-request-coach-chip" data-id=""
                      onClick={() => setCoachId('')} className={chipCls(coachId === '')}>
                      {t('no_coach_preference')}
                    </button>
                    {coaches.map((c) => (
                      <button key={c.id} type="button" data-testid="pt-request-coach-chip" data-id={c.id}
                        onClick={() => setCoachId(c.id)} className={chipCls(coachId === c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      data-testid="pt-request-send"
                      disabled={submitting}
                      onClick={() => handleRequest(pkg.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-700 px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {t('send_request')}
                    </button>
                    <button
                      data-testid="pt-request-cancel"
                      onClick={() => { setSelectedPkg(null); setCoachId(''); }}
                      className="rounded-lg border px-3 py-2 text-sm text-gray-600"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  data-testid="pt-request-open"
                  onClick={() => setSelectedPkg(pkg.id)}
                  className="w-full rounded-lg border border-primary-700/30 px-3 py-2 text-sm font-medium text-primary-700"
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
