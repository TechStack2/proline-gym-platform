import { createClient } from '@/lib/supabase/server';
import { localizedName, one } from '@/lib/names';
import { CoachPtRosterClient } from './pt-roster-client';
import { AvailabilityEditor } from './availability-editor';
import { PtProposals } from '@/components/shared/pt-proposals';

export const dynamic = 'force-dynamic';

export default async function CoachPtPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from('coaches').select('id, gym_id').eq('profile_id', user.id).maybeSingle();

  const [{ data: roster }, { data: sessions }, { data: windows }, { data: overrides }, { data: proposalsRaw }] = await Promise.all([
    supabase.rpc('get_coach_pt_roster'),
    supabase.rpc('get_coach_pt_sessions'),
    coach
      ? supabase.from('coach_availability').select('id, day_of_week, start_time, end_time, is_active')
          .eq('coach_id', coach.id).eq('is_active', true).order('day_of_week').order('start_time')
      : Promise.resolve({ data: [] as any[] }),
    coach
      ? supabase.from('coach_availability_overrides').select('id, date, kind, start_time, end_time')
          .eq('coach_id', coach.id).gte('date', new Date().toISOString().slice(0, 10)).order('date')
      : Promise.resolve({ data: [] as any[] }),
    coach
      ? supabase.from('pt_sessions')
          .select(`id, scheduled_at, proposed_by,
            students:student_id (profile_id, profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)),
            pt_packages:package_id (name_ar, name_en, name_fr)`)
          .eq('coach_id', coach.id).eq('status', 'proposed')
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // The ball is with the gym when the MEMBER (or their guardian) proposed last.
  const lname = (r: any) => ((locale === 'ar' ? r?.name_ar : locale === 'fr' ? r?.name_fr : r?.name_en) || r?.name_en || '');
  const proposals = ((proposalsRaw ?? []) as any[])
    .filter((sRow) => sRow.proposed_by && sRow.proposed_by !== user.id)
    .map((sRow) => ({
      id: sRow.id,
      studentName: localizedName(one(one(sRow.students)?.profiles), locale),
      packageName: lname(one(sRow.pt_packages)),
      scheduledAt: sRow.scheduled_at,
    }));

  return (
    <div className="space-y-4">
      {coach && (
        <div className="px-4 pt-4 space-y-4">
          {proposals.length > 0 && <PtProposals rows={proposals} locale={locale} />}
          <AvailabilityEditor
            coachId={coach.id}
            gymId={coach.gym_id}
            windows={(windows ?? []) as any}
            overrides={(overrides ?? []) as any}
            locale={locale}
          />
        </div>
      )}
      <CoachPtRosterClient roster={roster || []} sessions={sessions || []} locale={locale} />
    </div>
  );
}
