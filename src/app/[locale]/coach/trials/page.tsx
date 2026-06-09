import { createClient } from '@/lib/supabase/server';
import { CoachTrialsClient, type CoachTrial } from './trials-client';

export default async function CoachTrialsPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Definer reader (000023): the calling coach's trials with the lead name/phone
  // (coach is excluded from the leads RLS, so a direct join would be empty).
  const { data: trials } = await supabase.rpc('get_coach_trials');

  return <CoachTrialsClient trials={(trials || []) as CoachTrial[]} locale={locale} />;
}
