import { createClient } from '@/lib/supabase/server';
import { CoachPtRosterClient } from './pt-roster-client';

export default async function CoachPtPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: roster }, { data: sessions }] = await Promise.all([
    supabase.rpc('get_coach_pt_roster'),
    supabase.rpc('get_coach_pt_sessions'),
  ]);

  return <CoachPtRosterClient roster={roster || []} sessions={sessions || []} locale={locale} />;
}
