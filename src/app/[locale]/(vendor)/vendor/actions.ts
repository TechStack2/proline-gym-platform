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
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { actionError } from '@/lib/errors/action-error';
import { recordAudit } from '@/lib/audit/log';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { maskEmail } from '@/lib/auth/mask-email';
import { localizedName } from '@/lib/names';

type Result = { ok: true; active: boolean } | { ok: false; error: string };

/**
 * OWNER-RESET — the ONE platform-admin gate, extracted so every privileged action in
 * this file proves authorization the same way and there is a single place to audit it.
 *
 * It re-asserts on the CALLER'S OWN session, because a server action is an HTTP
 * endpoint: the page's `notFound()` gate hides the console but does not protect the
 * action, and a crafted POST reaches this code with no page involved. `is_platform_admin()`
 * is SECURITY DEFINER over `auth.uid()` (000082) — it reads the caller's identity from
 * their JWT, so it cannot be spoofed by anything in the request body.
 *
 * A `null` or errored RPC result is treated as DENY, never as "probably fine".
 */
type Caller = { userId: string; email: string | null };
async function requirePlatformAdmin(): Promise<{ ok: true; caller: Caller } | { ok: false; error: string }> {
  const supabase = await createClient(); // caller session (cookie JWT), NOT service-role
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  const { data: isAdmin, error } = await supabase.rpc('is_platform_admin');
  if (error || isAdmin !== true) return { ok: false, error: 'forbidden' };
  return { ok: true, caller: { userId: user.id, email: user.email ?? null } };
}

/** The gym's owner account, or WHY there isn't exactly one. */
export type GymOwner = { userId: string; name: string; maskedEmail: string };
type OwnerResult = { ok: true; owner: GymOwner } | { ok: false; error: string };

/**
 * Resolve the single ACTIVE owner of a gym.
 *
 * Both the confirmation lookup and the reset itself go through this, so what the
 * platform admin is shown and what actually gets reset can never diverge.
 *
 * Refuses rather than guessing when the answer is ambiguous (R2): zero owners, or more
 * than one. Picking "the first" owner of a gym with two would mean resetting a
 * credential belonging to a person nobody chose — the failure mode this action exists
 * to eliminate, not reproduce. `is_active` is filtered because a deactivated owner row
 * is not a current owner, and re-crediting one would be a quiet privilege restoration.
 */
async function resolveGymOwner(admin: SupabaseClient<any, any, any>, gymId: string): Promise<OwnerResult> {
  const { data: rows, error } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('gym_id', gymId)
    .eq('role', 'owner')
    .eq('is_active', true);
  if (error) return { ok: false, error: actionError(error) };

  // A user may hold several rows (is_primary variants) — the question is how many
  // distinct PEOPLE are owners, not how many rows exist.
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  if (userIds.length === 0) return { ok: false, error: 'no_owner' };
  if (userIds.length > 1) return { ok: false, error: 'multiple_owners' };

  const userId = userIds[0];
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  // A user_roles row with no GoTrue account is a login-less owner: there is no
  // password to reset, and creating one here would be provisioning, not a reset.
  if (!authUser?.user) return { ok: false, error: 'owner_no_account' };

  const { data: prof } = await admin
    .from('profiles')
    .select('first_name_ar, first_name_en, first_name_fr, last_name_ar, last_name_en, last_name_fr')
    .eq('id', userId)
    .maybeSingle();

  return {
    ok: true,
    owner: {
      userId,
      name: localizedName(prof, 'en') || '—',
      maskedEmail: maskEmail(authUser.user.email),
    },
  };
}

/**
 * R2 step 1 — who WOULD be reset. Read-only: mints nothing, changes nothing.
 * The console calls this to render the confirmation step, so the admin sees the
 * account before authorizing a credential to be issued for it.
 */
export async function lookupGymOwner(input: { gymId: string }): Promise<OwnerResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (typeof input?.gymId !== 'string' || !input.gymId) return { ok: false, error: 'invalid-input' };
  return resolveGymOwner(createAdminClient(), input.gymId);
}

type ResetResult =
  | { ok: true; tempPassword: string; ownerName: string; maskedEmail: string }
  | { ok: false; error: string };

/**
 * R1 — issue a temporary password for a gym's owner.
 *
 * FIELD DRIVER: recovering Proline's owner previously required a human with a database
 * URL writing a bcrypt hash into auth.users by hand. That is an unauditable operation
 * that only one person can perform, on the one table where a mistake is worst. This
 * replaces it with a gated, audited action.
 *
 * What it deliberately does NOT do:
 *   · touch auth.users directly — GoTrue's admin API owns credential storage, so
 *     hashing, session invalidation and identity bookkeeping stay its job;
 *   · invent a password format — it reuses generateTempPassword(), the one dictatable
 *     generator, because a support call ends with someone reading this over WhatsApp;
 *   · persist, log or transmit the password — it is returned to the caller ONCE, and
 *     the audit row records THAT a reset happened, never what was issued.
 *
 * `ownerUserId` is not trusted as a target; it is a CONCURRENCY CHECK. The action
 * re-resolves the owner and refuses if it no longer matches what the admin confirmed,
 * so ownership changing between the confirmation screen and the click cannot redirect
 * a credential to a different person.
 */
export async function resetGymOwnerPassword(
  input: { gymId: string; ownerUserId: string },
): Promise<ResetResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (typeof input?.gymId !== 'string' || !input.gymId) return { ok: false, error: 'invalid-input' };
  if (typeof input?.ownerUserId !== 'string' || !input.ownerUserId) return { ok: false, error: 'invalid-input' };

  const admin = createAdminClient();
  const resolved = await resolveGymOwner(admin, input.gymId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (resolved.owner.userId !== input.ownerUserId) return { ok: false, error: 'owner_changed' };

  const { data: existing } = await admin.auth.admin.getUserById(resolved.owner.userId);
  if (!existing?.user) return { ok: false, error: 'owner_no_account' };

  const temp = generateTempPassword();
  // must_change_password is SPREAD onto the existing app_metadata, not assigned over
  // it: app_metadata carries other claims, and replacing the object would silently
  // drop them. The flag rides the JWT, so the middleware forces /onboarding on the
  // very first request after sign-in with no extra DB read.
  const { error } = await admin.auth.admin.updateUserById(resolved.owner.userId, {
    password: temp,
    app_metadata: { ...(existing.user.app_metadata ?? {}), must_change_password: true },
  });
  if (error) return { ok: false, error: actionError(error) };

  // R3 — credential issuance MUST leave a trail: who issued, for whom, in which gym.
  // The password itself is never part of it; an audit row that contained the secret
  // would turn the trail into a second place the credential leaks from.
  await recordAudit(admin, {
    tableName: 'auth_users',
    recordId: resolved.owner.userId,
    operation: 'update',
    gymId: input.gymId,
    changedBy: gate.caller.userId,
    newData: { action: 'owner_password_reset', must_change_password: true },
  });
  // Ops tail — deliberately names the actor and target, never the credential.
  console.log(
    `[vendor] resetGymOwnerPassword by ${gate.caller.email ?? gate.caller.userId} ` +
    `(${gate.caller.userId}): gym ${input.gymId} owner ${resolved.owner.userId}`,
  );

  return {
    ok: true,
    tempPassword: temp,
    ownerName: resolved.owner.name,
    maskedEmail: resolved.owner.maskedEmail,
  };
}

/**
 * Suspend (is_active=false) or reactivate (true) a gym. Suspension is LANDING-ONLY
 * today: get_public_gym + the is_active_gym()-gated landing read policies stop
 * serving the gym's PUBLIC website + catalog to anon (000035/000078/000080-081),
 * but staff logins and the authenticated app are NOT affected — nothing is deleted.
 */
export async function setGymActive(input: { gymId: string; active: boolean }): Promise<Result> {
  // 1) NON-BYPASSABLE platform-admin gate — the CALLER's session, never the UI.
  //    OWNER-RESET: now the shared requirePlatformAdmin() so both privileged actions
  //    in this file prove authorization through ONE code path (identical behaviour —
  //    same RPC, same deny-on-error, same session source).
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

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
    changedBy: gate.caller.userId,
    oldData: { is_active: !input.active },
    newData: { is_active: input.active },
  });
  console.log(
    `[vendor] setGymActive by ${gate.caller.email ?? gate.caller.userId} (${gate.caller.userId}): ` +
    `gym ${input.gymId} (${updated.slug ?? '—'} / ${updated.name_en ?? '—'}) → is_active=${input.active}`,
  );

  revalidatePath('/[locale]/vendor', 'page');
  return { ok: true, active: input.active };
}
