'use server';

/**
 * VENDOR-CONSOLE-1 — platform-admin gym actions (SERVER ONLY).
 *
 * SECURITY MODEL (000082, mirrors onboardGym): the route gate is UI only; a server
 * action is directly invokable, so this RE-ASSERTS is_platform_admin() on the
 * CALLER'S OWN session BEFORE any privileged write — never trusting the page gate.
 * The privileged cross-tenant write runs through the service-role client ONLY after
 * that gate passes. Audit-conscious: the action logs who did what to which gym.
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { actionError } from '@/lib/errors/action-error';
import { recordAudit } from '@/lib/audit/log';

type Result = { ok: true; active: boolean } | { ok: false; error: string };

/**
 * Suspend (is_active=false) or reactivate (true) a gym. Suspension is LANDING-ONLY
 * today: get_public_gym + the is_active_gym()-gated landing read policies stop
 * serving the gym's PUBLIC website + catalog to anon (000035/000078/000080-081),
 * but staff logins and the authenticated app are NOT affected — nothing is deleted.
 */
export async function setGymActive(input: { gymId: string; active: boolean }): Promise<Result> {
  // 1) NON-BYPASSABLE platform-admin gate — the CALLER's session, never the UI.
  const caller = await createClient();
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  const { data: isAdmin, error: gateErr } = await caller.rpc('is_platform_admin');
  if (gateErr || isAdmin !== true) return { ok: false, error: 'forbidden' };

  if (typeof input?.gymId !== 'string' || typeof input?.active !== 'boolean') {
    return { ok: false, error: 'invalid-input' };
  }

  // 2) Privileged cross-tenant write (service-role; reached ONLY after the gate).
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from('gyms')
    .update({ is_active: input.active })
    .eq('id', input.gymId)
    .select('slug, name_en, is_active')
    .maybeSingle();
  if (error) return { ok: false, error: actionError(error) };
  if (!updated) return { ok: false, error: 'gym-not-found' };

  // 3) AUDIT PARITY (AUTH-DEPTH REQ3): a durable audit_logs row for the single
  //    highest-privilege cross-tenant action, attributed to the platform admin and
  //    scoped to the target gym (so the tenant's owner sees it too). Best-effort —
  //    never blocks the suspend/reactivate. (The server log stays for ops tailing.)
  await recordAudit(admin, {
    tableName: 'gyms',
    recordId: input.gymId,
    operation: 'update',
    gymId: input.gymId,
    changedBy: user.id,
    oldData: { is_active: !input.active },
    newData: { is_active: input.active },
  });
  console.log(
    `[vendor] setGymActive by ${user.email ?? user.id} (${user.id}): ` +
    `gym ${input.gymId} (${updated.slug ?? '—'} / ${updated.name_en ?? '—'}) → is_active=${input.active}`,
  );

  revalidatePath('/[locale]/vendor', 'page');
  return { ok: true, active: input.active };
}
