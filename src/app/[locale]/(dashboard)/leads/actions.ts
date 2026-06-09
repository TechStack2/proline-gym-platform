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
import {
  createNotification,
  createNotificationForRole,
} from '@/lib/notifications/create';
import { provisioning } from '@/lib/provisioning/simulated';
import { leadInsertSchema, type LeadInsert } from '@/lib/validators/leads.schema';

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
type AddLeadInput = LeadInsert & { source_detail?: string };

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

  // Authed staff INSERT — RLS leads_staff_insert (000023) is the guardrail
  // (same-gym, staff role). No .select() needed for the row body.
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      gym_id: gymId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      source: parsed.data.source,
      source_detail: input.source_detail || null,
      interested_discipline_id: parsed.data.discipline_id || null,
      notes: parsed.data.notes || null,
      status: 'new',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  // lead_new → the whole front desk (owner + receptionist), sanctioned pattern.
  const leadName = `${parsed.data.first_name} ${parsed.data.last_name}`.trim();
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

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  return { ok: true, leadId: lead.id };
}

// ── T3 — schedule a trial (date/time/coach) + notify the coach ───────────────
export async function scheduleTrial(input: {
  leadId: string;
  scheduledDate: string;
  scheduledTime: string;
  coachId: string;
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
    })
    .single();
  if (error || !trial) return { ok: false, error: error?.message ?? 'schedule_failed' };

  // trial_scheduled → the assigned coach (recipient = coach profile_id).
  if (input.coachId) {
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
  }

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  return { ok: true, trialId: (trial as { id: string }).id };
}

// ── T4 — record trial outcome (coach OR reception) ───────────────────────────
export async function recordTrialOutcome(input: {
  trialId: string;
  status: 'completed' | 'no_show' | 'cancelled';
  showUp: boolean;
  feedback?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await staffContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };
  const { supabase } = ctx;

  const { error } = await supabase.rpc('record_trial_outcome', {
    p_trial_id: input.trialId,
    p_status: input.status,
    p_show_up: input.showUp,
    p_feedback: input.feedback || null,
  });
  if (error) return { ok: false, error: error.message };

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
  if (error) return { ok: false, error: error.message };
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

  // lead_converted → the new member's profile (login-less now; readable once a
  // real login is provisioned). Sanctioned pattern, RETURNING-free.
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

  // Provisioning seam — simulated invite (no auth.users, no external send).
  const invite = await provisioning.inviteMember(
    { profileId, studentId, gymId, channel: 'whatsapp' },
    supabase,
  );

  revalidatePath('/[locale]/(dashboard)/leads', 'page');
  revalidatePath('/[locale]/(dashboard)/students', 'page');
  return {
    ok: true,
    studentId,
    invoiceNumber,
    totalUsd: Number(totalUsd),
    inviteStatus: invite.status,
  };
}
