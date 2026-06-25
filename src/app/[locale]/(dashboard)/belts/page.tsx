import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { BeltEngineClient } from './belt-engine-client';

type Props = { params: { locale: string } };

export default async function BeltsPage({ params }: Props) {
  const { locale } = params;
  const supabase = await createClient();
  const t = await getTranslations('belts');

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

  // ── Phase 1: Tables with direct gym_id column ──
  const [
    { data: students },
    { data: disciplines },
    { data: coaches },
  ] = await Promise.all([
    supabase
      .from('students')
      .select('id, current_belt_rank, belt_promotion_date, profile:profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('is_active', true)
      .eq('gym_id', gymId)
      .order('belt_promotion_date', { ascending: false }),
    supabase
      .from('disciplines')
      .select('id, name_ar, name_en, name_fr')
      .eq('gym_id', gymId)
      .eq('is_active', true) // ADM-2: archived disciplines were leaking into the promotion picker
      .order('sort_order'),
    supabase
      .from('coaches')
      .select('id, profile:profiles(first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .is('deleted_at', null),
  ]);

  // ── Phase 2: Tables scoped via discipline_id FK chain ──
  // belt_hierarchies and belt_promotions have no gym_id column;
  // they must be filtered through discipline_id → disciplines.gym_id
  const disciplineIds = (disciplines || []).map((d) => d.id as string);

  const [
    { data: beltHierarchies },
    { data: promotions },
  ] = await Promise.all([
    supabase
      .from('belt_hierarchies')
      .select('id, discipline_id, rank, name_ar, name_en, name_fr, sort_order, stripe_count, is_black_belt')
      .in('discipline_id', disciplineIds)
      .eq('is_active', true) // UX-2 ladder archive
      .order('sort_order'),
    supabase
      .from('belt_promotions')
      .select('id, student_id, coach_id, discipline_id, belt_hierarchy_id, from_rank, to_rank, promotion_date, notes_en, notes_ar, notes_fr, created_at')
      .in('discipline_id', disciplineIds)
      .order('promotion_date', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb Nav */}
      <nav className="flex items-center gap-2 text-sm text-gray-400">
        <a href={`/${locale}/dashboard`} className="hover:text-primary-600 transition-colors">
          {t('breadcrumb_dashboard')}
        </a>
        <span>/</span>
        <span className="text-gray-700 font-medium">
          {t('title')}
        </span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1 className={cn('hidden md:block text-2xl font-bold text-gray-900', locale === 'ar' && 'font-arabic')}>
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
        <a
          href={`/${locale}/students`}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          ← {t('back_to_students')}
        </a>
      </div>

      <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-xl" />}>
        <BeltEngineClient
          students={(students || []).map((s: Record<string, unknown>) => {
            const profile = (s.profile || {}) as Record<string, unknown>;
            return { ...s, user: profile } as any;
          })}
          disciplines={disciplines || []}
          coaches={(coaches || []).map((c: Record<string, unknown>) => {
            const profile = (c.profile || {}) as Record<string, unknown>;
            return { id: c.id as string, user: profile } as any;
          })}
          beltHierarchies={beltHierarchies || []}
          promotions={promotions || []}
          locale={locale}
        />
      </Suspense>
    </div>
  );
}
