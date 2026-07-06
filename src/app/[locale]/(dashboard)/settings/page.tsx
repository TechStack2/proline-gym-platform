import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { SettingsClient } from './_components/settings-client';
import { PtPolicySettings } from './_components/pt-policy-settings';
import { WhatsAppSettings } from './_components/whatsapp-settings';
import { getWhatsAppStatus } from './_components/whatsapp-actions';
import { WaiverSettings } from './_components/waiver-settings';
import { getWaiverTemplate } from './_components/waiver-actions';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { parseEnabledProducts } from '@/lib/gym/products';
import { Languages } from 'lucide-react';
import Link from 'next/link';

type Props = { params: { locale: string }; searchParams?: { tab?: string } };

export default async function SettingsPage({ params, searchParams }: Props) {
  const { locale } = params;
  const t = await getTranslations('settings');
  const isRTL = locale === 'ar';
  const supabase = await createClient();

  // Fetch gym data (single row for PRO LINE Gym)
  const { data: gymData } = await supabase
    .from('gyms')
    .select('*')
    .limit(1)
    .single();

  // NO-MEMBERSHIP-GAPS: gate the membership config surfaces (link + plans tab)
  // when the gym doesn't sell membership. The row is already fetched (select *).
  const products = parseEnabledProducts((gymData as { enabled_products?: unknown } | null)?.enabled_products);

  // PERF-SSR: gymData is fetched first (the rest filter by its id); everything below
  // is INDEPENDENT — exchange rates, membership plans, the PT catalog, disciplines, the
  // WhatsApp status, and the waiver template. Fetch them in ONE parallel wave instead of
  // ~6 sequential awaits (the last two were even awaited inline in the JSX below). Same
  // queries, same variables → identical data + render to the client.
  const gymId = gymData?.id ?? '';
  const [
    { data: rates },
    { data: plans },
    { data: ptTypes },
    { data: disciplines },
    whatsappStatus,
    waiverTemplate,
  ] = await Promise.all([
    // Exchange rates, ordered by date desc
    supabase.from('exchange_rates').select('*').order('rate_date', { ascending: false }),
    // Membership plans (gym-scoped: the *_read RLS is all-authenticated)
    supabase.from('membership_plans').select('*').eq('gym_id', gymId).order('duration_days', { ascending: true }),
    // PT package-type catalog (incl. archived, for the manager) — PT-1
    supabase
      .from('pt_packages')
      .select('id, name_ar, name_en, name_fr, session_count, price_usd, validity_days, discipline_id, is_active, show_on_landing')
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .order('session_count', { ascending: true }),
    // Disciplines with their belt hierarchies (incl. archived, for the manager)
    supabase.from('disciplines').select('*, belt_hierarchies(*)').eq('gym_id', gymId).order('sort_order', { ascending: true }),
    // G1: per-gym WhatsApp config status (definer read) — was `await getWhatsAppStatus()` inline in the JSX
    getWhatsAppStatus(),
    // F3: gym-configurable waiver template — was `await getWaiverTemplate()` inline in the JSX
    getWaiverTemplate(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn('hidden md:block text-2xl font-bold text-gray-900', isRTL && 'font-arabic')}>
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* IA-1: Configuration row — the config destinations re-homed out of the nav. */}
      <div className="flex flex-wrap gap-2" data-testid="settings-config-row">
        <Link href={`/${locale}/disciplines`} className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'التخصصات' : locale === 'fr' ? 'Disciplines' : 'Disciplines'}
        </Link>
        <Link href={`/${locale}/belts`} className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'الأحزمة' : locale === 'fr' ? 'Ceintures' : 'Belts'}
        </Link>
        {/* NO-MEMBERSHIP-GAPS: a classes+PT gym has no membership plans to configure. */}
        {products.membership && (
          <Link href={`/${locale}/settings?tab=plans`} className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {locale === 'ar' ? 'خطط العضوية' : locale === 'fr' ? "Plans d'adhésion" : 'Membership plans'}
          </Link>
        )}
        {/* REP-1: reports re-enters the nav here (out-of-nav since IA-1; repaired). */}
        <Link href={`/${locale}/reports`} data-testid="settings-reports-link" className="rounded-full border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {locale === 'ar' ? 'التقارير' : locale === 'fr' ? 'Rapports' : 'Reports'}
        </Link>
      </div>

      {/* PWA-MOBILE-UX #3: the language switcher lives in Settings too (the header
          switcher is easy to miss after login, especially on mobile). Reuses the
          inline LanguageSwitcher (ar/en/fr) — client component, own boundary. */}
      <section data-testid="settings-language" className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className={cn('mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>
          <Languages className="h-4 w-4 text-primary-600" />
          {locale === 'ar' ? 'اللغة' : locale === 'fr' ? 'Langue' : 'Language'}
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          {locale === 'ar' ? 'اختر لغة الواجهة' : locale === 'fr' ? "Choisissez la langue de l'interface" : 'Choose the interface language'}
        </p>
        <LanguageSwitcher locale={locale} variant="inline" />
      </section>

      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-12 bg-gray-100 rounded-xl" />
            <div className="h-64 bg-gray-100 rounded-2xl" />
          </div>
        }
      >
        <SettingsClient
          initialTab={searchParams?.tab}
          locale={locale}
          gym={gymData}
          rates={rates || []}
          plans={plans || []}
          disciplines={disciplines || []}
          ptTypes={ptTypes || []}
          showMembership={products.membership}
        />
      </Suspense>

      {gymData && (
        <PtPolicySettings
          locale={locale}
          gymId={gymData.id}
          noShowForfeits={!!gymData.pt_no_show_forfeits}
          lateCancelWindowHours={gymData.pt_late_cancel_window_hours ?? 0}
        />
      )}

      {/* G1: per-gym WhatsApp Cloud-API config (status read via the definer; the
          token is write-only and never fetched to the client). */}
      <WhatsAppSettings initial={whatsappStatus} locale={locale} />

      {/* F3: gym-configurable liability waiver (tenant-clean DATA; body edit bumps version). */}
      <WaiverSettings initial={waiverTemplate} locale={locale} />
    </div>
  );
}
