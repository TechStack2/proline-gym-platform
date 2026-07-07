import { setRequestLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { Building2, Plus, Users } from 'lucide-react';
import { VendorGymActions } from './vendor-gym-actions';

// Super-admin surface — always per-request (reads the caller's session + gate).
export const dynamic = 'force-dynamic';

type AdminGym = {
  id: string;
  name_en: string | null;
  slug: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
};

/**
 * VENDOR-CONSOLE — the platform admin's home (the WL provider surface). Server gate
 * mirrors /onboard EXACTLY: anon → login; any authenticated non-platform-admin →
 * notFound() (404 — hidden, not merely denied). The cross-tenant gym list comes from
 * the SECURITY DEFINER get_all_gyms_for_admin() (000083), which re-asserts the same
 * is_platform_admin() gate server-side (never client-trusted). VENDOR-CONSOLE-1 adds
 * per-gym actions (open landing / copy login / suspend-reactivate) + a status chip +
 * a platform summary; suspend routes through the gated setGymActive action.
 */
export default async function VendorConsolePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (isAdmin !== true) notFound();

  const t = await getTranslations('vendor.console');
  const isRTL = locale === 'ar';
  const { data } = await supabase.rpc('get_all_gyms_for_admin');
  const gyms = (data ?? []) as AdminGym[];
  const activeCount = gyms.filter((g) => g.is_active).length;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-CA'); // stable YYYY-MM-DD

  return (
    <div className="mx-auto max-w-4xl px-4 py-10" data-testid="vendor-console" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn('text-2xl font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="vendor-title">
            {t('title')}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500" data-testid="vendor-summary">
            <Building2 className="h-4 w-4" /> {t('summary', { gyms: gyms.length, active: activeCount })}
          </p>
        </div>
        <Link
          href={`/${locale}/onboard`}
          data-testid="vendor-onboard-link"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#cd1419] px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-[#a81014]"
        >
          <Plus className="h-4 w-4" /> {t('onboardCta')}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-start text-gray-500">
              <th className="p-3 font-medium">{t('colGym')}</th>
              <th className="p-3 font-medium">{t('colSlug')}</th>
              <th className="p-3 font-medium">{t('colStatus')}</th>
              <th className="p-3 font-medium">{t('colMembers')}</th>
              <th className="p-3 font-medium">{t('colCreated')}</th>
              <th className="p-3 font-medium">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody data-testid="vendor-gym-list">
            {gyms.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400" data-testid="vendor-gyms-empty">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              gyms.map((g) => (
                <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50" data-testid="vendor-gym-row" data-slug={g.slug ?? ''}>
                  <td className="p-3 font-medium text-gray-900">{g.name_en || '—'}</td>
                  <td className="p-3 font-mono text-xs text-gray-600" dir="ltr">{g.slug || '—'}</td>
                  <td className="p-3">
                    <span
                      data-testid="vendor-gym-status"
                      data-active={g.is_active}
                      className={g.is_active
                        ? 'inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                        : 'inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'}
                    >
                      {g.is_active ? t('statusActive') : t('statusSuspended')}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-gray-400" /> {g.member_count}</span>
                  </td>
                  <td className="p-3 text-gray-500" dir="ltr">{fmtDate(g.created_at)}</td>
                  <td className="p-3">
                    <VendorGymActions
                      gymId={g.id}
                      slug={g.slug ?? ''}
                      name={g.name_en || g.slug || '—'}
                      active={g.is_active}
                      locale={locale}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
