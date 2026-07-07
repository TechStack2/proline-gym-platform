'use server';

/**
 * PT session delivery server actions (Cycle 5 / Phase 1 / Prompt C1).
 *
 * All credit consumption flows through the migration 000027 RPCs (the single
 * writer is complete_pt_session). The atomic credit/session change is FATAL;
 * notifications are BEST-EFFORT after it (E13 / 23-R lesson) and use the
 * sanctioned F2 pattern (RETURNING-free, authed client, recipient profile_id,
 * guardian fan-out). Coach AND reception may schedule/complete/cancel.
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createNotification, createNotificationForRole } from '@/lib/notifications/create';
import { studentNotificationRecipients } from '@/lib/notifications/recipients';
import { actionError } from '@/lib/errors/action-error';

type Ctx = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; gymId: string };

async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };
  const { data: profile } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();
  if (!profile?.gym_id) return { error: 'no_gym' };
  return { supabase, userId: user.id, gymId: profile.gym_id };
}

type SessionRow = {
  id: string; student_id: string; coach_id: string; assignment_id: string | null; scheduled_at: string;
};

async function coachProfileId(c: Ctx, coachId: string): Promise<string | null> {
  const { data } = await c.supabase.from('coaches').select('profile_id').eq('id', coachId).single();
  return data?.profile_id ?? null;
}

async function notifySession(
  c: Ctx,
  studentId: string,
  type: 'pt_session_scheduled' | 'pt_session_completed' | 'pt_session_cancelled' | 'pt_session_no_show',
  params: Record<string, unknown>,
  alsoCoachProfileId?: string | null,
): Promise<void> {
  const recipients = await studentNotificationRecipients(c.supabase, studentId);
  if (alsoCoachProfileId) recipients.push(alsoCoachProfileId);
  for (const recipientProfileId of [...new Set(recipients)]) {
    await createNotification(
      {
        recipientProfileId,
        gymId: c.gymId,
        type,
        titleKey: `messages.${type}.title`,
        bodyKey: `messages.${type}.body`,
        params,
        entityType: 'pt_session',
        actionUrl: '/portal/pt',
      },
      c.supabase,
    );
  }
}

// ── T1 — schedule a session from an active assignment ────────────────────────
export async function schedulePtSession(input: {
  assignmentId: string;
  scheduledAt?: string;
  coachId?: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const c = await ctx();
  if ('error' in c) return { ok: false, error: c.error };

  const { data: session, error } = await c.supabase
    .rpc('schedule_pt_session', {
      p_assignment_id: input.assignmentId,
      p_coach_id: input.coachId || null,
      p_scheduled_at: input.scheduledAt || null,
      p_duration: 60,
    })
    .single();
  if (error || !session) {
    console.error('[schedulePtSession] RPC failed:', error?.message);
    return { ok: false, error: actionError(error) };
  }
  const s = session as SessionRow;
  try {
    await notifySession(c, s.student_id, 'pt_session_scheduled', { date: s.scheduled_at }, await coachProfileId(c, s.coach_id));
  } catch (e) {
    console.error('[schedulePtSession] notify failed (non-fatal):', e);
  }
  revalidatePath('/[locale]/coach/pt', 'page');
  return { ok: true, sessionId: s.id };
}

// ── T2 — complete a session (the single credit writer; idempotent) ───────────
export async function completePtSession(input: {
  sessionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await ctx();
  if ('error' in c) return { ok: false, error: c.error };

  const { data: session, error } = await c.supabase
    .rpc('complete_pt_session', { p_session_id: input.sessionId })
    .single();
  if (error || !session) {
    console.error('[completePtSession] RPC failed:', error?.message);
    return { ok: false, error: actionError(error) };
  }
  const s = session as SessionRow;
  try {
    await notifySession(c, s.student_id, 'pt_session_completed', {});
    // pt_credits_exhausted → student + staff when remaining hits 0.
    if (s.assignment_id) {
      const { data: a } = await c.supabase
        .from('pt_assignments')
        .select('sessions_remaining')
        .eq('id', s.assignment_id)
        .single();
      if (a && a.sessions_remaining <= 0) {
        const recipients = await studentNotificationRecipients(c.supabase, s.student_id);
        for (const recipientProfileId of recipients) {
          await createNotification(
            { recipientProfileId, gymId: c.gymId, type: 'pt_credits_exhausted', titleKey: 'messages.pt_credits_exhausted.title', bodyKey: 'messages.pt_credits_exhausted.body', params: {}, entityType: 'pt_assignment', entityId: s.assignment_id, actionUrl: '/portal/pt' },
            c.supabase,
          );
        }
        for (const role of ['owner', 'receptionist'] as const) {
          await createNotificationForRole(
            { role, gymId: c.gymId, type: 'pt_credits_exhausted', titleKey: 'messages.pt_credits_exhausted.title', bodyKey: 'messages.pt_credits_exhausted.body', params: {}, entityType: 'pt_assignment', entityId: s.assignment_id, actionUrl: '/pt' },
            c.supabase,
          );
        }
      }
    }
  } catch (e) {
    console.error('[completePtSession] notify failed (non-fatal):', e);
  }
  revalidatePath('/[locale]/coach/pt', 'page');
  return { ok: true };
}

// ── T1 log-on-delivery — schedule + complete in one step ─────────────────────
// The session is delivered instantly, so we DON'T emit pt_session_scheduled here
// (a "scheduled" alert for an already-completed session is noise) — only the
// completion notification fires. (The standalone Schedule path still notifies.)
export async function logPtDelivery(input: {
  assignmentId: string;
  coachId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await ctx();
  if ('error' in c) return { ok: false, error: c.error };

  const { data: session, error } = await c.supabase
    .rpc('schedule_pt_session', {
      p_assignment_id: input.assignmentId,
      p_coach_id: input.coachId || null,
      p_scheduled_at: null,
      p_duration: 60,
    })
    .single();
  if (error || !session) {
    console.error('[logPtDelivery] schedule RPC failed:', error?.message);
    return { ok: false, error: actionError(error) };
  }
  return completePtSession({ sessionId: (session as SessionRow).id });
}

// ── T3/T4 — no-show / cancel (policy-aware, server-side) ─────────────────────
export async function cancelOrNoShowPtSession(input: {
  sessionId: string;
  outcome: 'cancelled' | 'no_show';
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await ctx();
  if ('error' in c) return { ok: false, error: c.error };

  const { data: session, error } = await c.supabase
    .rpc('cancel_or_no_show_pt_session', { p_session_id: input.sessionId, p_outcome: input.outcome })
    .single();
  if (error || !session) {
    console.error('[cancelOrNoShowPtSession] RPC failed:', error?.message);
    return { ok: false, error: actionError(error) };
  }
  const s = session as SessionRow;
  const type = input.outcome === 'no_show' ? 'pt_session_no_show' : 'pt_session_cancelled';
  try {
    await notifySession(c, s.student_id, type, { date: s.scheduled_at }, await coachProfileId(c, s.coach_id));
  } catch (e) {
    console.error('[cancelOrNoShowPtSession] notify failed (non-fatal):', e);
  }
  revalidatePath('/[locale]/coach/pt', 'page');
  return { ok: true };
}

// ── T4 — reschedule (no credit effect) ───────────────────────────────────────
export async function reschedulePtSession(input: {
  sessionId: string;
  scheduledAt: string;
  coachId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await ctx();
  if ('error' in c) return { ok: false, error: c.error };

  const { data: session, error } = await c.supabase
    .rpc('reschedule_pt_session', { p_session_id: input.sessionId, p_scheduled_at: input.scheduledAt, p_coach_id: input.coachId || null })
    .single();
  if (error || !session) {
    console.error('[reschedulePtSession] RPC failed:', error?.message);
    return { ok: false, error: actionError(error) };
  }
  const s = session as SessionRow;
  try {
    await notifySession(c, s.student_id, 'pt_session_scheduled', { date: s.scheduled_at }, await coachProfileId(c, s.coach_id));
  } catch (e) {
    console.error('[reschedulePtSession] notify failed (non-fatal):', e);
  }
  revalidatePath('/[locale]/coach/pt', 'page');
  return { ok: true };
}

// ── IA-3 — PT conflict guard (READ-SIDE ONLY, non-blocking) ──────────────────
// Called by the scheduling UI before booking to surface "this coach already has
// X at HH:MM" overlaps (other PT sessions + the coach's recurring class slots).
// It changes NOTHING about the write path — schedule_pt_session (C1) remains
// the single write authority and staff may intentionally double-book.
export type PtConflict = { kind: 'pt' | 'class'; label: string; time: string };

export async function checkPtScheduleConflicts(input: {
  assignmentId: string;
  coachId?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number;
}): Promise<{ ok: true; coachName: string; conflicts: PtConflict[] } | { ok: false; error: string }> {
  const c = await ctx();
  if ('error' in c) return { ok: false, error: c.error };

  const { data: assignment } = await c.supabase
    .from('pt_assignments')
    .select('coach_id, student_id')
    .eq('id', input.assignmentId)
    .maybeSingle();
  const coachId = input.coachId || assignment?.coach_id;
  if (!coachId) return { ok: true, coachName: '', conflicts: [] };

  // Mirror schedule_pt_session's defaults: scheduled_at = now(), 60 minutes.
  const start = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  const durMs = (input.durationMinutes ?? 60) * 60_000;
  const end = new Date(start.getTime() + durMs);
  const dayStart = `${start.toISOString().slice(0, 10)}T00:00:00`;
  const dayEnd = `${start.toISOString().slice(0, 10)}T23:59:59`;
  const dow = start.getDay();

  const [{ data: coach }, { data: sessions }, { data: classes }] = await Promise.all([
    c.supabase
      .from('coaches')
      .select('profiles:profile_id (first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr)')
      .eq('id', coachId)
      .maybeSingle(),
    c.supabase
      .from('pt_sessions')
      .select('id, scheduled_at, duration_minutes, status')
      .eq('coach_id', coachId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', dayStart)
      .lt('scheduled_at', dayEnd),
    c.supabase
      .from('classes')
      .select('id, name_ar, name_en, name_fr, schedules:class_schedules(day_of_week, start_time, end_time, is_active)')
      .eq('coach_id', coachId)
      .eq('is_active', true),
  ]);

  const conflicts: PtConflict[] = [];

  for (const s of (sessions ?? []) as any[]) {
    const sStart = new Date(s.scheduled_at);
    const sEnd = new Date(sStart.getTime() + (s.duration_minutes ?? 60) * 60_000);
    if (sStart < end && sEnd > start) {
      conflicts.push({
        kind: 'pt',
        label: 'PT',
        time: sStart.toTimeString().slice(0, 5),
      });
    }
  }

  const startHm = start.toTimeString().slice(0, 5);
  const endHm = end.toTimeString().slice(0, 5);
  for (const cls of (classes ?? []) as any[]) {
    for (const slot of cls.schedules ?? []) {
      if (slot.is_active === false || slot.day_of_week !== dow) continue;
      const slotStart = String(slot.start_time).slice(0, 5);
      const slotEnd = String(slot.end_time).slice(0, 5);
      if (slotStart < endHm && slotEnd > startHm) {
        conflicts.push({ kind: 'class', label: cls.name_en || cls.name_ar || '', time: slotStart });
      }
    }
  }

  const prof = coach ? (Array.isArray((coach as any).profiles) ? (coach as any).profiles[0] : (coach as any).profiles) : null;
  const coachName = prof ? [prof.first_name_en || prof.first_name_ar, prof.last_name_en || prof.last_name_ar].filter(Boolean).join(' ') : '';

  return { ok: true, coachName, conflicts };
}
