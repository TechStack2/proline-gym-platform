'use server';

/**
 * Lead → Active-Member journey server actions (Cycle 5 / Phase 1 / Prompt 23-R).
 *
 * Every mutation runs in the staff session, so the server Supabase client carries
 * the staff user's auth — RLS is the guardrail (no SECURITY DEFINER bypass for the
 * notification producers). Notifications use the sanctioned F2 pattern:
 * createNotification / createNotificationForRole directly from the action with
 * THIS authed client + the recipient's profile_id, RETURNING-free. The multi-row
 * writes (trial, outcome, convert) go through atomic, gym-scoped, staff-only
 * SECURITY DEFINER RPCs (migration 000023).
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils/phone';
import {
  createNotification,
  createNotificationForRole,
} from '@/lib/notifications/create';
import { provisioning } from '@/lib/provisioning/simulated';
import { leadInsertSchema, type LeadInsert } from '@/lib/validators/leads.schema';
import { actionError } from '@/lib/errors/action-error';
import { coachTrialSlots, type PtTrialSlot } from '@/lib/trials/occurrences';
import { hmInTz } from '@/lib/coach/availability';

type StaffCtx = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; gymId: string };

async function staffContext(): Promise<StaffCtx | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('gym_id')
    .eq('id', user.id)
    .single();
  const gymId = profile?.gym_id;
  if (!gymId) return { error: 'no_gym' };
  return { supabase, userId: user.id, gymId };
}

// ── T1b — staff-manual origination (Add Lead) ────────────────────────────────
// OFF-3b: `clientUuid` is the offline idempotency key (a re-push settles exactly
// one lead). Online single-fire omits it → behaviour unchanged.
type AddLeadInput = LeadInsert & { source_detail?: string; clientUuid?: string | null };

export async function addLead(
  input: AddLeadInput,
): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const parsed = leadInsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' };
  }
  const ctx = await staffContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };
  const { supabase, gymId } = ctx;

  // OFF-3b idempotency: if this offline op already created a lead, return it (no dup).
  const clientUuid = input.clientUuid ?? null;
  if (clientUuid) {
    const { data: existing } = await supabase
      .from('leads').select('id').eq('client_uuid', clientUuid).maybeSingle();
    if (existing) return { ok: true, leadId: existing.id };
  }

  // Authed staff INSERT — RLS leads_staff_insert (000023) is the guardrail
  // (same-gym, staff role). No .select() needed for the row body.
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      gym_id: gymId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      phone: normalizePhone(parsed.data.phone), // MJ-2: store the canonical shape

      email: parsed.data.email || null,
      source: parsed.data.source,
      source_detail: input.source_detail || null,
      interested_discipline_id: parsed.data.discipline_id || null,
      notes: parsed.data.notes || null,
      status: 'new',
      client_uuid: clientUuid,
    })
    .select('id')
    .single();
  if (error) {
    // A concurrent re-push collided on the client_uuid unique index → idempotent:
    // fetch the canonical lead and return it instead of erroring.
    if (clientUuid && error.code === '23505') {
      const { data: dup } = await supabase
        .from('leads').select('id').eq('client_uuid', clientUuid).maybeSingle();
      if (dup) return { ok: true, leadId: dup.id };
    }
    return { ok: false, error: actionError(error) };
  }

  // lead_new → the whole front desk (owner + receptionist), sanctioned pattern.
  // Best-effort: a notification failure must never abort the lead creation.
  const leadName = `${parsed.data.first_name} ${parsed.data.last_name}`.trim();
  try {
    for (const role of ['owner', 'receptionist'] as const) {
      await createNotificationForRole(
        {
          role,
          gymId,
          type: 'lead_new',
          titleKey: 'messages.lead_new.title',
          bodyKey: 'messages.lead_new.body',
          params: { leadName },
          entityType: 'lead',
          entityId: lead.id,
          actionUrl: '/leads',
        },
        supabase,
      );
    }
  } catch (e) {
    console.error('[addLead] lead_new notify failed (non-fatal):', e);
  }

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  return { ok: true, leadId: lead.id };
}

// ── T3 — schedule a trial (date/time/coach) + notify the coach ───────────────
export async function scheduleTrial(input: {
  leadId: string;
  scheduledDate: string;
  scheduledTime: string;
  coachId: string;
  // TRIAL-SLOTS: a CLASS trial pins the picked class occurrence; a PT trial passes
  // classId null (coach + real availability slot only). Trials are free today —
  // feeUsd rides through the fee-capable flag (default 0) for a chargeable-later PT.
  classId?: string | null;
  feeUsd?: number;
}): Promise<{ ok: true; trialId: string } | { ok: false; error: string }> {
  const ctx = await staffContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };
  const { supabase, gymId } = ctx;

  const { data: trial, error } = await supabase
    .rpc('schedule_trial', {
      p_lead_id: input.leadId,
      p_scheduled_date: input.scheduledDate,
      p_scheduled_time: input.scheduledTime || null,
      p_coach_id: input.coachId || null,
      p_class_id: input.classId || null,
      p_fee_usd: input.feeUsd ?? 0,
    })
    .single();
  if (error || !trial) return { ok: false, error: actionError(error) };

  // trial_scheduled → the assigned coach (recipient = coach profile_id).
  // Best-effort: a notification failure must never abort the trial write.
  if (input.coachId) {
    try {
      const { data: coach } = await supabase
        .from('coaches')
        .select('profile_id')
        .eq('id', input.coachId)
        .single();
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name')
        .eq('id', input.leadId)
        .single();
      if (coach?.profile_id) {
        const leadName = `${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`.trim();
        await createNotification(
          {
            recipientProfileId: coach.profile_id,
            gymId,
            type: 'trial_scheduled',
            titleKey: 'messages.trial_scheduled.title',
            bodyKey: 'messages.trial_scheduled.body',
            params: { leadName, date: input.scheduledDate, time: input.scheduledTime || '' },
            entityType: 'trial',
            entityId: (trial as { id: string }).id,
            actionUrl: '/coach/trials',
          },
          supabase,
        );
      }
    } catch (e) {
      console.error('[scheduleTrial] trial_scheduled notify failed (non-fatal):', e);
    }
  }

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  return { ok: true, trialId: (trial as { id: string }).id };
}

// TRIAL-SLOTS R4 — a PT trial books the coach's REAL availability. Reuses the PT slot
// idiom (openAvailabilityGaps via coachTrialSlots): published windows + extras − blocks
// − the coach's class hours − existing PT, over the next ~2 weeks, gridded at the gym
// slot size, in the gym timezone. On-demand per selected coach.
function localDateTime(d: Date, tz: string): { date: string; hm: string } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMinutesLocal(dt: { date: string; hm: string }, mins: number): { date: string; hm: string } {
  const [h, m] = dt.hm.split(':').map(Number);
  let total = h * 60 + m + mins;
  let date = dt.date;
  while (total >= 1440) { total -= 1440; date = addDaysISO(date, 1); }
  while (total < 0) { total += 1440; date = addDaysISO(date, -1); }
  return { date, hm: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` };
}

export async function getCoachTrialSlots(coachId: string): Promise<{ ok: true; slots: PtTrialSlot[] } | { ok: false; error: string }> {
  const ctx = await staffContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };
  const { supabase, gymId } = ctx;
  if (!coachId) return { ok: true, slots: [] };

  const { data: gym } = await supabase.from('gyms')
    .select('timezone, pt_slot_minutes, pt_booking_horizon_days, pt_min_notice_hours').eq('id', gymId).single();
  const tz = gym?.timezone || 'Asia/Beirut';
  const slotMinutes = Number(gym?.pt_slot_minutes) || 60;
  const days = Math.min(Number(gym?.pt_booking_horizon_days) || 14, 14);
  const minNoticeH = Number(gym?.pt_min_notice_hours) || 0;

  const nowLocal = localDateTime(new Date(), tz);
  const fromISO = nowLocal.date;

  const [{ data: windows }, { data: overrides }, { data: classRows }, { data: pt }] = await Promise.all([
    supabase.from('coach_availability').select('day_of_week, start_time, end_time').eq('coach_id', coachId).eq('is_active', true),
    supabase.from('coach_availability_overrides').select('date, kind, start_time, end_time').eq('coach_id', coachId).gte('date', fromISO),
    supabase.from('class_schedules').select('day_of_week, start_time, end_time, classes!inner(coach_id)').eq('classes.coach_id', coachId).eq('is_active', true),
    supabase.from('pt_sessions').select('scheduled_at, duration_minutes').eq('coach_id', coachId).in('status', ['scheduled', 'proposed']).gte('scheduled_at', `${fromISO}T00:00:00Z`),
  ]);

  const classByDow = new Map<number, { start: string; end: string }[]>();
  for (const c of (classRows ?? []) as { day_of_week: number; start_time: string; end_time: string }[]) {
    const arr = classByDow.get(c.day_of_week) ?? [];
    arr.push({ start: c.start_time.slice(0, 5), end: c.end_time.slice(0, 5) });
    classByDow.set(c.day_of_week, arr);
  }
  const ptByDate: Record<string, { start: string; end: string }[]> = {};
  for (const s of (pt ?? []) as { scheduled_at: string; duration_minutes: number }[]) {
    const endIso = new Date(new Date(s.scheduled_at).getTime() + (Number(s.duration_minutes) || 60) * 60000).toISOString();
    const date = localDateTime(new Date(s.scheduled_at), tz).date;
    (ptByDate[date] ??= []).push({ start: hmInTz(s.scheduled_at, tz), end: hmInTz(endIso, tz) });
  }
  const busyByDate: Record<string, { start: string; end: string }[]> = {};
  for (let i = 0; i < days; i++) {
    const date = addDaysISO(fromISO, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    busyByDate[date] = [...(classByDow.get(dow) ?? []), ...(ptByDate[date] ?? [])];
  }

  let slots = coachTrialSlots({
    fromISO, days, slotMinutes,
    windows: (windows ?? []).map((w) => ({ day_of_week: (w as { day_of_week: number }).day_of_week, start_time: (w as { start_time: string }).start_time.slice(0, 5), end_time: (w as { end_time: string }).end_time.slice(0, 5) })),
    overrides: (overrides ?? []).map((o) => ({ date: (o as { date: string }).date, kind: (o as { kind: 'block' | 'extra' }).kind, start_time: (o as { start_time: string | null }).start_time?.slice(0, 5) ?? null, end_time: (o as { end_time: string | null }).end_time?.slice(0, 5) ?? null })),
    busyByDate,
  });
  const cutoff = addMinutesLocal(nowLocal, minNoticeH * 60);
  slots = slots.filter((s) => s.date > cutoff.date || (s.date === cutoff.date && s.time >= cutoff.hm));
  return { ok: true, slots };
}

// ── T4 — record trial outcome (coach OR reception) ───────────────────────────
export async function recordTrialOutcome(input: {
  trialId: string;
  status: 'completed' | 'no_show' | 'cancelled';
  showUp: boolean;
  feedback?: string;
  interested?: boolean | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await staffContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };
  const { supabase } = ctx;

  // UX-2: stage flip + interested + the trial_outcome staff emit are all inside
  // the RPC (the coach caller can't read leads app-side — see 000049).
  const { error } = await supabase.rpc('record_trial_outcome', {
    p_trial_id: input.trialId,
    p_status: input.status,
    p_show_up: input.showUp,
    p_feedback: input.feedback || null,
    p_interested: input.interested ?? null,
  });
  if (error) return { ok: false, error: actionError(error) };

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  revalidatePath('/[locale]/coach/trials', 'page');
  return { ok: true };
}

// ── T5 — convert → onboard (atomic RPC) + lead_converted + provisioning seam ─
export async function convertLead(input: {
  leadId: string;
  planId: string;
}): Promise<
  | { ok: true; studentId: string; invoiceNumber: string; totalUsd: number; inviteStatus: string }
  | { ok: false; error: string }
> {
  const ctx = await staffContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };
  const { supabase, gymId } = ctx;

  const { data: rows, error } = await supabase.rpc('convert_lead_to_member', {
    p_lead_id: input.leadId,
    p_plan_id: input.planId,
  });
  if (error) {
    console.error('[convertLead] convert_lead_to_member RPC failed:', error.message);
    return { ok: false, error: actionError(error) };
  }
  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result) return { ok: false, error: 'convert_returned_no_row' };

  const {
    student_id: studentId,
    profile_id: profileId,
    invoice_number: invoiceNumber,
    total_usd: totalUsd,
  } = result as {
    student_id: string;
    profile_id: string;
    invoice_number: string;
    total_usd: number;
  };

  // The member + membership + invoice are now committed (the RPC is atomic). The
  // notification and provisioning are BEST-EFFORT side-effects — a failure here
  // must never roll back or abort the conversion.

  // lead_converted → the new member's profile (login-less now; readable once a
  // real login is provisioned). Sanctioned pattern, RETURNING-free.
  try {
    const { data: gym } = await supabase
      .from('gyms')
      .select('name_en')
      .eq('id', gymId)
      .single();
    await createNotification(
      {
        recipientProfileId: profileId,
        gymId,
        type: 'lead_converted',
        titleKey: 'messages.lead_converted.title',
        bodyKey: 'messages.lead_converted.body',
        params: { gymName: gym?.name_en ?? 'PRO LINE Gym' },
        entityType: 'student',
        entityId: studentId,
        actionUrl: '/portal/dashboard',
      },
      supabase,
    );
  } catch (e) {
    console.error('[convertLead] lead_converted notify failed (non-fatal):', e);
  }

  // Provisioning seam — simulated invite (no auth.users, no external send).
  let inviteStatus = 'pending';
  try {
    const invite = await provisioning.inviteMember(
      { profileId, studentId, gymId, channel: 'whatsapp' },
      supabase,
    );
    inviteStatus = invite.status;
  } catch (e) {
    console.error('[convertLead] provisioning failed (non-fatal):', e);
  }

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  revalidatePath('/[locale]/(dashboard)/students', 'page');
  return {
    ok: true,
    studentId,
    invoiceNumber,
    totalUsd: Number(totalUsd),
    inviteStatus,
  };
}

/**
 * OFF-3b — discard a conflicted offline lead intent WITH an audit trail (never a
 * silent drop). The lead never reached the server, so the audit (000064) is scoped
 * by the staff actor's gym. A reason is mandatory.
 */
export async function discardOfflineLead(input: {
  opId: string; name: string; reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { error } = await supabase.rpc('discard_offline_lead', {
    p_op_id: input.opId,
    p_name: input.name,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: actionError(error) };
  return { ok: true };
}
