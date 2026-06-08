import { createClient } from '@/lib/supabase/server';
import { CoachPtRosterClient } from './pt-roster-client';

export default async function CoachPtPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: roster } = await supabase.rpc('get_coach_pt_roster');

  return <CoachPtRosterClient roster={roster || []} locale={locale} />;
}
