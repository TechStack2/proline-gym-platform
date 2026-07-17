'use server'

/**
 * ON-1 inviteToPortal (Option B, spike §7b) — adopt a login-less profile by
 * PRE-CREATING the GoTrue auth user with the profile's EXISTING id. The F1
 * trigger (000017 ON CONFLICT DO NOTHING) NO-OPs, so the member/coach keeps
 * their id and all 8 child FKs stay valid (zero identity migration).
 *
 * AUTHZ: the gate runs on the CALLER's JWT (staff + same gym, under the
 * caller's RLS) BEFORE any service-role call. The admin client is used only
 * after the gate passes. The temp password is returned ONCE and never persisted.
 */
import crypto from 'crypto'
import { generateTempPassword } from '@/lib/auth/temp-password'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gymDisplayName } from '@/lib/whatsapp/identity'
import { gymCanonicalOrigin } from '@/lib/host/primary-domain'
import { recordAudit } from '@/lib/audit/log'
import { actionError } from '@/lib/errors/action-error';

type InviteInput =
  | { studentId: string }
  | { coachId: string }
  | { profileId: string; role: 'student' | 'parent' | 'coach' | 'head_coach' | 'receptionist' }

// WL-IDENTITY: the invite message greets the member with the CALLER's gym name
// (localized), not a hardcoded "PRO LINE". The invite is staff-side so the gym is
// known; the surface (buildWaLink) picks by the staff's locale.
type GymName = { ar: string; en: string; fr: string }
// INVITE-HOST: `origin` is the gym's CANONICAL origin (primary custom domain →
// <slug>.praxella.com → SITE_URL) so the shared login link lands on the gym's own
// home, not whatever host the staffer generated it from.
type InviteOk = { ok: true; tempPassword: string; login: string; waPhone: string; role: string; gymName: GymName; origin: string }
// MJ-1: `holder` carries the name of the existing credentialed owner for the
// `phone_taken` invariant, so the surface can say WHO already holds the phone.
type InviteErr = { ok: false; error: string; holder?: string }

const STAFF_ROLES = ['owner', 'head_coach', 'receptionist']

export async function inviteToPortal(input: InviteInput): Promise<InviteOk | InviteErr> {
  const supabase = await createClient() // caller session (cookie JWT)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // ── Gate on the CALLER: staff role + their gym (under caller RLS) ──
  const { data: callerRole } = await supabase
    .from('user_roles').select('role, gym_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!callerRole || !STAFF_ROLES.includes(callerRole.role)) {
    return { ok: false, error: 'forbidden' }
  }
  const callerGym = callerRole.gym_id as string

  // ── Resolve the target { profileId, phone, gymId, role } via caller RLS
  //    (so a target outside the caller's gym simply doesn't resolve) ──
  let profileId: string | null = null
  let gymId: string | null = null
  let role: string
  if ('studentId' in input) {
    const { data: s } = await supabase.from('students').select('profile_id, gym_id').eq('id', input.studentId).maybeSingle()
    if (!s) return { ok: false, error: 'target_not_found' }
    profileId = s.profile_id; gymId = s.gym_id; role = 'student'
  } else if ('coachId' in input) {
    const { data: c } = await supabase.from('coaches').select('profile_id, gym_id').eq('id', input.coachId).maybeSingle()
    if (!c) return { ok: false, error: 'target_not_found' }
    profileId = c.profile_id; gymId = c.gym_id; role = 'coach'
  } else {
    // STAFF-INVITE hardening — RUNTIME allowlist. The TS union is compile-time
    // only: a crafted POST to this server action can carry ANY string as `role`
    // (e.g. 'owner'), so validate against the explicit set of invitable roles.
    // 'owner' is NEVER settable via invite.
    const INVITABLE_ROLES = ['coach', 'head_coach', 'receptionist', 'parent', 'student'] as const
    if (!INVITABLE_ROLES.includes(input.role as (typeof INVITABLE_ROLES)[number])) {
      return { ok: false, error: 'forbidden' }
    }
    // Granting a STAFF role (receptionist/head_coach) is an owner/head_coach-only
    // power — a receptionist must not mint staff logins.
    if ((input.role === 'receptionist' || input.role === 'head_coach') &&
        !['owner', 'head_coach'].includes(callerRole.role)) {
      return { ok: false, error: 'forbidden' }
    }
    const { data: p } = await supabase.from('profiles').select('gym_id').eq('id', input.profileId).maybeSingle()
    if (!p) return { ok: false, error: 'target_not_found' }
    profileId = input.profileId; gymId = p.gym_id; role = input.role
  }
  if (!profileId || !gymId) return { ok: false, error: 'target_not_found' }
  if (gymId !== callerGym) return { ok: false, error: 'cross_gym' } // belt + suspenders over RLS

  // WL-IDENTITY: the caller's gym name (localized) for the invite greeting.
  const { data: gymRow } = await supabase.from('gyms').select('name_ar, name_en, name_fr, slug').eq('id', gymId).maybeSingle()
  const gymName: GymName = {
    ar: gymDisplayName(gymRow, 'ar'), en: gymDisplayName(gymRow, 'en'), fr: gymDisplayName(gymRow, 'fr'),
  }
  // INVITE-HOST: resolve the gym's canonical origin (primary domain → subdomain → SITE_URL).
  const origin = await gymCanonicalOrigin(gymRow?.slug)

  const { data: prof } = await supabase.from('profiles').select('phone').eq('id', profileId).maybeSingle()
  const phone = (prof?.phone ?? '').trim()
  if (!phone) return { ok: false, error: 'no_phone' }

  // MJ-1 CREDENTIAL INVARIANT: a phone may back at most ONE login per gym. Login-less
  // records (no auth user) may share a phone freely — the guard bites only here, at
  // credential issuance. Ask the gym-scoped DEFINER checker whether another
  // CREDENTIALED profile already holds this (normalized) number; if so, refuse before
  // touching GoTrue so we never create a second login for a taken phone.
  const { data: holder } = await supabase.rpc('credentialed_phone_owner', { p_phone: phone, p_exclude: profileId })
  if (holder) return { ok: false, error: 'phone_taken', holder: holder as string }

  // CREDENTIAL SHAPE (live finding): this project has PHONE LOGINS DISABLED, so
  // a phone+password sign-in fails ("Phone logins are disabled"). Email logins
  // ARE enabled. So we credential with a SYNTHETIC EMAIL keyed on the profile id
  // (globally unique → collision-proof across ephemeral e2e runs) while STILL
  // setting `phone` on the auth user — so G1 is a pure credential swap to
  // phone-OTP (spike §7d), the adopted id unchanged. Staff get this email + the
  // phone (for the wa.me share); the member signs in with the email.
  const login = `m-${profileId}@members.proline.lb`

  // ── Privileged ops (service role) — only now ──
  const admin = createAdminClient()
  const temp = generateTempPassword()

  const { data: existing } = await admin.auth.admin.getUserById(profileId)
  if (existing?.user) {
    // Re-invite: regenerate the temp password + re-arm the forced change.
    const { error } = await admin.auth.admin.updateUserById(profileId, {
      password: temp,
      app_metadata: { ...(existing.user.app_metadata ?? {}), must_change_password: true },
    })
    if (error) return { ok: false, error: actionError(error) }
  } else {
    // First adoption: create the auth user WITH the profile id (trigger NO-OPs).
    const { error } = await admin.auth.admin.createUser({
      id: profileId,
      email: login,
      phone,
      password: temp,
      email_confirm: true,
      phone_confirm: true,
      app_metadata: { must_change_password: true },
    } as any) // supabase-js type omits `id`; GoTrue accepts it (STEP-0 confirmed)
    if (error) return { ok: false, error: actionError(error) }
  }

  // ── user_roles: login-less profiles have none — required for routing/RLS ──
  const { error: roleErr } = await admin.from('user_roles')
    .upsert({ user_id: profileId, gym_id: gymId, role }, { onConflict: 'user_id,role,gym_id' })
  if (roleErr) return { ok: false, error: actionError(roleErr) }

  // ── account_invites: make the 23R simulated invite real (no new table) ──
  const { data: inv } = await admin.from('account_invites')
    .select('id').eq('profile_id', profileId).eq('gym_id', gymId).limit(1).maybeSingle()
  const invPayload = {
    gym_id: gymId, profile_id: profileId,
    student_id: 'studentId' in input ? input.studentId : null,
    channel: 'whatsapp', token: crypto.randomUUID(), status: 'sent', provider: 'real',
    updated_at: new Date().toISOString(),
  }
  if (inv) await admin.from('account_invites').update(invPayload).eq('id', inv.id)
  else await admin.from('account_invites').insert(invPayload)

  // AUDIT PARITY (AUTH-DEPTH REQ3): record credential issuance — who granted portal
  // access (and which role) to whom, in which gym. Best-effort, attributed to the
  // inviting staff member + the target gym. Runs through the service-role client
  // (auth.uid() is null here), so changed_by/gym_id are passed explicitly.
  await recordAudit(admin, {
    tableName: 'account_invites',
    recordId: profileId,
    operation: 'create',
    gymId,
    changedBy: user.id,
    newData: { role, channel: 'whatsapp', reinvite: !!existing?.user },
  })

  return { ok: true, tempPassword: temp, login, waPhone: phone, role, gymName, origin }
}
