/**
 * Recipient resolution for member-facing notifications (Cycle 5 / 24-R).
 *
 * A notification about a student goes to the student's own profile AND to every
 * linked guardian's profile (minor → parent alerted even when the child is
 * login-less). Primary contact first. Used by the activity-loop producers
 * (enrollment_confirmed, attendance_absent, belt_promoted) so guardian fan-out
 * is consistent and RLS-safe (the caller's authed staff/coach client reads
 * guardians within its own gym).
 */
import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolve the notification recipients for a student: the student's profile id
 * first, then linked guardians' profile ids (primary contact first), de-duped.
 */
export async function studentNotificationRecipients(
  supabase: ServerClient,
  studentId: string,
): Promise<string[]> {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (id?: string | null) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };

  const { data: student } = await supabase
    .from('students')
    .select('profile_id')
    .eq('id', studentId)
    .single();
  add(student?.profile_id);

  const { data: links } = await supabase
    .from('guardian_students')
    .select('guardians ( profile_id, is_primary_contact )')
    .eq('student_id', studentId);

  type GuardianRow = { profile_id: string | null; is_primary_contact: boolean | null };
  const guardians: GuardianRow[] = (links ?? [])
    .map((l) => {
      const g = (l as { guardians: GuardianRow | GuardianRow[] | null }).guardians;
      return Array.isArray(g) ? g[0] : g;
    })
    .filter((g): g is GuardianRow => !!g);

  // Primary contacts first, then the rest.
  guardians.sort((a, b) => Number(b.is_primary_contact) - Number(a.is_primary_contact));
  for (const g of guardians) add(g.profile_id);

  return ordered;
}
