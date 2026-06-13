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
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type InviteInput =
  | { studentId: string }
  | { coachId: string }
  | { profileId: string; role: 'student' | 'parent' | 'coach' | 'head_coach' | 'receptionist' }

type InviteOk = { ok: true; tempPassword: string; login: string; waPhone: string; role: string }
type InviteErr = { ok: false; error: string }

const STAFF_ROLES = ['owner', 'head_coach', 'receptionist']

/** Strong, human-shareable temp password meeting GoTrue complexity. */
function tempPassword(): string {
  const a = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
  return `PL-${a}${crypto.randomInt(10, 99)}!`
}

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
    const { data: p } = await supabase.from('profiles').select('gym_id').eq('id', input.profileId).maybeSingle()
    if (!p) return { ok: false, error: 'target_not_found' }
    profileId = input.profileId; gymId = p.gym_id; role = input.role
  }
  if (!profileId || !gymId) return { ok: false, error: 'target_not_found' }
  if (gymId !== callerGym) return { ok: false, error: 'cross_gym' } // belt + suspenders over RLS

  const { data: prof } = await supabase.from('profiles').select('phone').eq('id', profileId).maybeSingle()
  const phone = (prof?.phone ?? '').trim()
  if (!phone) return { ok: false, error: 'no_phone' }

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
  const temp = tempPassword()

  const { data: existing } = await admin.auth.admin.getUserById(profileId)
  if (existing?.user) {
    // Re-invite: regenerate the temp password + re-arm the forced change.
    const { error } = await admin.auth.admin.updateUserById(profileId, {
      password: temp,
      app_metadata: { ...(existing.user.app_metadata ?? {}), must_change_password: true },
    })
    if (error) return { ok: false, error: error.message }
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
    if (error) return { ok: false, error: error.message }
  }

  // ── user_roles: login-less profiles have none — required for routing/RLS ──
  const { error: roleErr } = await admin.from('user_roles')
    .upsert({ user_id: profileId, gym_id: gymId, role }, { onConflict: 'user_id,role,gym_id' })
  if (roleErr) return { ok: false, error: roleErr.message }

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

  return { ok: true, tempPassword: temp, login, waPhone: phone, role }
}
