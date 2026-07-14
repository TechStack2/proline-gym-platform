'use server';

/**
 * PRAXELLA-DOOR R4 — platform-lead triage actions (SERVER ONLY).
 *
 * SECURITY MODEL (VENDOR-CONSOLE-1, 000082): the route gate is UI only; a server
 * action is directly invokable, so this RE-ASSERTS is_platform_admin() on the
 * CALLER'S OWN session BEFORE any privileged write — never trusting the page gate.
 * The status write runs through the service-role client ONLY after that gate
 * passes (platform_leads has NO write policy — only service_role can mutate it).
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { actionError } from '@/lib/errors/action-error';

type Result = { ok: true; status: string } | { ok: false; error: string };

const STATUSES = ['new', 'contacted', 'closed'] as const;
type LeadStatus = (typeof STATUSES)[number];

export async function setPlatformLeadStatus(input: { leadId: string; status: LeadStatus }): Promise<Result> {
  // 1) NON-BYPASSABLE platform-admin gate — the CALLER's session, never the UI.
  const caller = await createClient();
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  const { data: isAdmin, error: gateErr } = await caller.rpc('is_platform_admin');
  if (gateErr || isAdmin !== true) return { ok: false, error: 'forbidden' };

  if (typeof input?.leadId !== 'string' || !STATUSES.includes(input?.status)) {
    return { ok: false, error: 'invalid-input' };
  }

  // 2) Privileged write (service-role; reached ONLY after the gate).
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from('platform_leads')
    .update({ status: input.status })
    .eq('id', input.leadId)
    .select('id, status')
    .maybeSingle();
  if (error) return { ok: false, error: actionError(error) };
  if (!updated) return { ok: false, error: 'lead-not-found' };

  // 3) Ops trail (platform_leads is vendor-internal — no gym-scoped audit_logs row;
  //    the server log attributes who changed which lead to what).
  console.log(`[vendor] setPlatformLeadStatus by ${user.email ?? user.id} (${user.id}): lead ${input.leadId} → ${input.status}`);

  revalidatePath('/[locale]/requests', 'page');
  return { ok: true, status: input.status };
}
