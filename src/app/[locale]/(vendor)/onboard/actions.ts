'use server';

import { z } from 'zod';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gymCanonicalOrigin } from '@/lib/host/primary-domain';

/**
 * WL-ONBOARDING-WIZARD — onboardGym server action (SERVER ONLY).
 *
 * Creates a NEW gym + its owner login. SUPER-ADMIN ONLY: this RE-ASSERTS
 * is_platform_admin() on the caller's own session BEFORE any write — the route
 * gate is UI only; a server action is directly invokable, so the gate here is the
 * real, non-bypassable security boundary. Privileged writes run through the
 * service-role client ONLY after that gate passes. Reuses provision-proline.js's
 * proven sequence (gym → GoTrue owner → profile gym_id fix → owner role → starter
 * catalog), with best-effort cleanup on any partial failure (GoTrue + Postgres
 * can't share one transaction, so the auth user is the only cross-system artifact).
 */

const OnboardSchema = z.object({
  gymNameEn: z.string().trim().min(2).max(120),
  gymNameAr: z.string().trim().min(1).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$/, 'slug must be 3–100 chars, a–z 0–9 and hyphens'),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerFirstEn: z.string().trim().min(1).max(80),
  ownerLastEn: z.string().trim().min(1).max(80),
});

export type OnboardResult =
  | { ok: true; gymId: string; slug: string; ownerEmail: string; tempPassword: string; origin: string }
  | { ok: false; error: string };

export async function onboardGym(input: unknown): Promise<OnboardResult> {
  // 1) NON-BYPASSABLE super-admin gate — the CALLER's session, never the UI.
  const caller = await createClient();
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  const { data: isAdmin, error: gateErr } = await caller.rpc('is_platform_admin');
  if (gateErr || isAdmin !== true) return { ok: false, error: 'forbidden' };

  // 2) Validate.
  const parsed = OnboardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid-input' };
  const f = parsed.data;

  // 3) Privileged writes (service-role; only reached AFTER the gate passed).
  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  // 3a) Gym. Explicit sensible defaults (owner refines in Settings).
  const { data: gym, error: ge } = await admin
    .from('gyms')
    .insert({
      name_ar: f.gymNameAr,
      name_en: f.gymNameEn,
      name_fr: f.gymNameEn,
      slug: f.slug,
      currency_preference: 'USD',
      tax_rate: 0,
      enabled_products: { membership: true, class: true, pt: true, camp: true },
      is_active: true,
    })
    .select('id')
    .single();
  if (ge || !gym) return { ok: false, error: (ge as { code?: string } | null)?.code === '23505' ? 'slug-taken' : 'gym-failed' };
  const gymId = gym.id as string;

  const dropGym = async () => {
    await admin.from('gyms').delete().eq('id', gymId);
  };

  // 3b) Owner auth user via GoTrue admin. handle_new_user (000017) auto-creates the
  //     profile, but with gym_id = the OLDEST active gym — fixed in 3c.
  const { data: au, error: ae } = await admin.auth.admin.createUser({
    email: f.ownerEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { gym_id: gymId },
    app_metadata: { must_change_password: true },
  });
  if (ae || !au?.user) {
    await dropGym();
    return { ok: false, error: 'owner-email-failed' };
  }
  const ownerId = au.user.id;
  const rollback = async () => {
    await admin.auth.admin.deleteUser(ownerId).catch(() => {});
    await dropGym();
  };

  // 3c) UPSERT the owner's profile → the NEW gym + names. An UPSERT (keyed on id),
  //     NOT an update: handle_new_user (000017) can RACE/MISS on prod → no profile
  //     row exists → .update().eq('id') hits 0 rows → the owner has a role but NO
  //     profile → the dashboard shell FREEZES on their first login. Upsert
  //     GUARANTEES the profile exists and points at the NEW gym (gym_id is NOT NULL
  //     and must win over any trigger-set oldest-gym fallback), regardless of the
  //     trigger. profiles' only NOT NULL columns without a default are id + gym_id.
  const { error: pe } = await admin.from('profiles').upsert(
    {
      id: ownerId,
      gym_id: gymId,
      first_name_ar: f.ownerFirstEn, first_name_en: f.ownerFirstEn, first_name_fr: f.ownerFirstEn,
      last_name_ar: f.ownerLastEn, last_name_en: f.ownerLastEn, last_name_fr: f.ownerLastEn,
    },
    { onConflict: 'id' },
  );
  if (pe) {
    await rollback();
    return { ok: false, error: 'profile-failed' };
  }

  // 3d) Owner role.
  const { error: re } = await admin
    .from('user_roles')
    .insert({ user_id: ownerId, gym_id: gymId, role: 'owner', is_primary: true });
  if (re) {
    await rollback();
    return { ok: false, error: 'role-failed' };
  }

  // 3e) WIZARD STOP-SEEDING (FX-PER-GYM): a new gym starts EMPTY — no starter
  //     disciplines/plans and no exchange rate — so the onboarding checklist reads
  //     the honest truth (discipline/plan/exchange items UNCHECKED) and the owner
  //     configures their own catalog. (Was: 2 default disciplines + 1 staged plan.)

  // INVITE-HOST: the new gym's canonical origin for the shared links (a fresh gym
  // has no primary domain yet → its <slug>.praxella.com subdomain).
  const origin = await gymCanonicalOrigin(f.slug);
  return { ok: true, gymId, slug: f.slug, ownerEmail: f.ownerEmail, tempPassword, origin };
}
