'use server';

/**
 * Attendance save + transition-guarded absence notification (Cycle 5 / 24-R, T2).
 *
 * Keeps the strong idempotent upsert into attendance_records (UNIQUE
 * class_id+student_id+date), but moves it server-side so the absence handoff uses
 * the sanctioned F2 pattern. Transition guard: attendance_absent fires only on a
 * transition INTO absent/late (prior status was neither) — re-saving the roster
 * does NOT re-notify. present/excused fire nothing. Touches NO PT table.
 */
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import { studentNotificationRecipients } from '@/lib/notifications/recipients';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export async function saveAttendance(input: {
  classId: string;
  date: string;
  records: { studentId: string; status: AttendanceStatus }[];
}): Promise<{ ok: true; notified: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single();
  const gymId = profile?.gym_id;
  if (!gymId) return { ok: false, error: 'no_gym' };

  const isAbsentLate = (s: AttendanceStatus) => s === 'absent' || s === 'late';

  // Read PRIOR statuses for this (class, date) BEFORE the upsert — the basis of
  // the transition guard.
  const { data: prior } = await supabase
    .from('attendance_records')
    .select('student_id, status')
    .eq('class_id', input.classId)
    .eq('attendance_date', input.date);
  const priorMap = new Map<string, AttendanceStatus>(
    (prior ?? []).map((r) => [r.student_id, r.status as AttendanceStatus]),
  );

  // Idempotent upsert (unchanged shape; one row per student).
  for (const r of input.records) {
    const { error } = await supabase.from('attendance_records').upsert(
      {
        class_id: input.classId,
        student_id: r.studentId,
        attendance_date: input.date,
        status: r.status,
        marked_by: user.id,
      },
      { onConflict: 'class_id, student_id, attendance_date' },
    );
    if (error) return { ok: false, error: error.message };
  }

  // Transition-guarded attendance_absent. Only students newly absent/late.
  const transitioned = input.records.filter(
    (r) => isAbsentLate(r.status) && !isAbsentLate(priorMap.get(r.studentId) ?? 'present'),
  );

  let notified = 0;
  if (transitioned.length > 0) {
    try {
      const { data: cls } = await supabase
        .from('classes')
        .select('name_en')
        .eq('id', input.classId)
        .single();
      const className = cls?.name_en ?? '';

      for (const r of transitioned) {
        const { data: stu } = await supabase
          .from('students')
          .select('profiles ( first_name_en, last_name_en )')
          .eq('id', r.studentId)
          .single();
        const prof = stu?.profiles as { first_name_en: string | null; last_name_en: string | null } | { first_name_en: string | null; last_name_en: string | null }[] | null;
        const p = Array.isArray(prof) ? prof[0] : prof;
        const studentName = `${p?.first_name_en ?? ''} ${p?.last_name_en ?? ''}`.trim();

        const recipients = await studentNotificationRecipients(supabase, r.studentId);
        for (const recipientProfileId of recipients) {
          await createNotification(
            {
              recipientProfileId,
              gymId,
              type: 'attendance_absent',
              titleKey: 'messages.attendance_absent.title',
              bodyKey: 'messages.attendance_absent.body',
              params: { studentName, className },
              entityType: 'class',
              entityId: input.classId,
              actionUrl: '/portal/progress',
            },
            supabase,
          );
          notified += 1;
        }
      }
    } catch (e) {
      console.error('[saveAttendance] attendance_absent notify failed (non-fatal):', e);
    }
  }

  return { ok: true, notified };
}
