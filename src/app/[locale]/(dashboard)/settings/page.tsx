import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { SettingsClient } from './_components/settings-client';
import { getWhatsAppStatus } from './_components/whatsapp-actions';
import { getWaiverTemplate } from './_components/waiver-actions';
import { parseEnabledProducts } from '@/lib/gym/products';
import { isClassComplete } from '@/lib/products/completeness';
import { PageHeader } from '@/components/ui/page-header';

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
    { count: campsCount },
    { count: classesCount },
    { count: classesOnLandingCount },
    { data: classesForCompleteness },
  ] = await Promise.all([
    // Exchange rates, ordered by date desc
    supabase.from('exchange_rates').select('*').eq('gym_id', gymId).order('rate_date', { ascending: false }).limit(50),
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
    // M2-A MANAGE-INDEX: LIVE Camps chip — one gym-scoped head:true count (product-gated card).
    supabase.from('camps').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).is('deleted_at', null),
    // M2-E CLASS-HOME: LIVE Classes chip — two gym-scoped head:true counts: total active
    // classes + how many are shown on the public page (show_on_landing).
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null),
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('is_active', true).eq('show_on_landing', true).is('deleted_at', null),
    // COMPLETENESS R3: the Manage index Classes card flags how many live classes are
    // half-configured (no schedule slot / inactive coach). One gym-scoped read with the
    // schedule + coach-active shape the shared helper needs.
    supabase.from('classes').select('id, schedules:class_schedules(id), coach:coaches(is_active)').eq('gym_id', gymId).eq('is_active', true).is('deleted_at', null),
  ]);

  // COMPLETENESS R3: count via the shared model (warn-level; never blocks anything).
  const incompleteClassesCount = (classesForCompleteness ?? []).filter((c) => !isClassComplete(c as any)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader segment="settings" />
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
      </div>

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
          whatsappStatus={whatsappStatus}
          waiverTemplate={waiverTemplate}
          ptNoShowForfeits={!!gymData?.pt_no_show_forfeits}
          ptLateCancelWindowHours={gymData?.pt_late_cancel_window_hours ?? 0}
          showMembership={products.membership}
          showCamps={products.camp}
          campsCount={campsCount ?? 0}
          classesCount={classesCount ?? 0}
          classesOnLandingCount={classesOnLandingCount ?? 0}
          incompleteClassesCount={incompleteClassesCount}
        />
      </Suspense>
    </div>
  );
}
