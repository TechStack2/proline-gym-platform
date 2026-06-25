import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import { PTPackagesClient } from './pt-client';
import { PtRestorePanel, type PtRestoreAssignment } from './pt-restore-panel';

type Props = { params: { locale: string } };

export default async function PTPage({ params }: Props) {
  const { locale } = params;
  const supabase = await createClient();

  // ── Auth + gym_id for multi-tenant isolation ──────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single();

  const gymId = profile?.gym_id;
  if (!gymId) return null;

  // Phase 1: Independent gym-scoped queries
  const [
    { data: packages },
    { data: students },
    { data: coaches },
  ] = await Promise.all([
    supabase
      .from('pt_packages')
      .select('*')
      .eq('gym_id', gymId)
      .order('session_count'),
    supabase
      .from('students')
      .select('id, profile:profiles(first_name_ar, first_name_en, last_name_ar, last_name_en)')
      .eq('is_active', true)
      .eq('gym_id', gymId),
    supabase
      .from('coaches')
      .select('id, profile:profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en)')
      .eq('gym_id', gymId)
      .eq('is_active', true),
  ]);

  // Phase 2: Dependent queries — require package IDs from Phase 1
  // Implicitly gym-scoped via package_id IN-filter — packages are filtered by gym_id above (line 28)
  const packageIds = `(${(packages || []).map(p => p.id).join(',')})`;

  const [{ data: assignments }, { data: pendingRequests }] = await Promise.all([
    supabase
      .from('pt_assignments')
      .select('*')
      .eq('is_active', true)
      .neq('status', 'requested')
      .filter('package_id', 'in', packageIds)
      .gt('sessions_remaining', 0),
    supabase
      .from('pt_assignments')
      .select('id, student_id, package_id, coach_id, sessions_total, requested_at')
      .eq('status', 'requested')
      .filter('package_id', 'in', packageIds)
      .order('requested_at', { ascending: false, nullsFirst: false }),
  ]);

  // C1 — assignments with consumed credits, for the staff Restore-credit panel
  // (any status, so a reactivated/zeroed assignment stays visible to test the guard).
  const { data: restoreAssignments } = await supabase
    .from('pt_assignments')
    .select('id, sessions_total, sessions_used, sessions_remaining, status, student:students(profile:profiles(first_name_ar, first_name_en, last_name_ar, last_name_en))')
    .filter('package_id', 'in', packageIds)
    .neq('status', 'requested')
    .order('updated_at', { ascending: false })
    .limit(50);

  const t = await getTranslations('pt');

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn('hidden md:block text-2xl font-bold text-gray-900', locale === 'ar' && 'font-arabic')}>
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('subtitle')}
        </p>
      </div>
      <PtRestorePanel assignments={(restoreAssignments || []) as PtRestoreAssignment[]} locale={locale} />
      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-xl" />}>
        <PTPackagesClient
          packages={packages || []}
          students={(students || []).map((s: Record<string, unknown>) => {
            const profile = (s.profile || {}) as Record<string, unknown>;
            return { ...s, user: profile } as any;
          })}
          coaches={(coaches || []).map((c: Record<string, unknown>) => {
            const profile = (c.profile || {}) as Record<string, unknown>;
            return { ...c, user: profile } as any;
          })}
          assignments={assignments || []}
          pendingRequests={pendingRequests || []}
          locale={locale}
          gymId={gymId}
        />
      </Suspense>
    </div>
  );
}
